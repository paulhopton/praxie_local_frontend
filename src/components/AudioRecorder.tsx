'use client';

import { useRef, useState, useEffect } from 'react';

// Audio worklet processor code
const workletCode = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      // Handle messages from the main thread
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      this.port.postMessage(channelData);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
`;

// Add these constants at the top of the component
const OVERLAP_SECONDS = 1; // 1 second overlap
const SILENCE_DURATION_MS = 700; // 700ms of silence to trigger send
const SILENCE_THRESHOLD = 0.01; // Adjust as needed for your mic/environment

export default function AudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [pendingTranscript, setPendingTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<'elevenlabs' | 'local'>('elevenlabs');
  const [language, setLanguage] = useState('de');
  const [ebmResult, setEbmResult] = useState<null | {
    matches: {
      code: string;
      title: string;
      description: string;
      explanation?: {
        final_score: number;
      };
      relevance?: {
        is_relevant?: boolean;
      };
    }[];
  }>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const overlapBufferRef = useRef<Float32Array | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const transcriptChunksRef = useRef<{ [seq: number]: string }>({});
  const lastSeqRef = useRef(-1);
  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const amplitudeBufferRef = useRef<number[]>([]);
  const WAVEFORM_DURATION = 10; // seconds
  const WAVEFORM_FPS = 30;
  const WAVEFORM_BARS = 100; // number of bars
  const WAVEFORM_BAR_WIDTH = 4;
  const WAVEFORM_BAR_GAP = 2;
  const WAVEFORM_HEIGHT = 64;
  const [activeTab, setActiveTab] = useState<'transcription' | 'summary'>('transcription');
  const [patientId, setPatientId] = useState<string>('');
  const [medicalSummary, setMedicalSummary] = useState<{
    patient_id: string;
    conversation_id: string;
    anamnesis: string | null;
    chief_complaint: string | null;
    physical_examination: string | null;
    assessment: string | null;
    plan: string | null;
    doctor_specialisation: string | null;
  } | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const lastHIDValueRef = useRef(0);
  const hidPressActiveRef = useRef(false);

  // Language options
  const languageOptions = [
    { code: 'de', label: 'German' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'French' },
    { code: 'es', label: 'Spanish' },
    { code: 'tr', label: 'Turkish' },
    { code: 'ru', label: 'Russian' },
  ];

  // Helper to flatten chunks
  const flattenChunks = (chunks: Float32Array[]) => {
    let totalLength = 0;
    for (const chunk of chunks) totalLength += chunk.length;
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  };

  // Fetch available audio input devices
  useEffect(() => {
    const getAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (err) {
        // Optionally handle error
      }
    };
    getAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', getAudioDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getAudioDevices);
    };
  }, []);

  const startRecording = async () => {
    try {
      // Reset sequence and transcript buffer
      seqRef.current = 0;
      transcriptChunksRef.current = {};
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1
        }
      });
      
      // Create audio context
      const audioContext = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'interactive'
      });
      
      // Create audio source
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create and set up audio worklet
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);
      
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      
      // Process audio data
      audioChunksRef.current = [];
      overlapBufferRef.current = null;
      workletNode.port.onmessage = (event) => {
        const chunk = new Float32Array(event.data);
        audioChunksRef.current.push(chunk);
        // --- Waveform update ---
        // Calculate amplitude (RMS) for this chunk
        const rms = Math.sqrt(chunk.reduce((sum, v) => sum + v * v, 0) / chunk.length);
        // Push to amplitude buffer
        const buffer = amplitudeBufferRef.current;
        buffer.push(rms);
        // Keep only last N samples (10s * FPS)
        const maxSamples = WAVEFORM_DURATION * WAVEFORM_FPS;
        if (buffer.length > maxSamples) buffer.splice(0, buffer.length - maxSamples);
        // Redraw waveform
        drawWaveform();
        // Silence detection
        const now = Date.now();
        if (rms < SILENCE_THRESHOLD) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
            // Detected silence for long enough, send chunk
            sendChunkWithOverlap();
            silenceStartRef.current = null;
          }
        } else {
          silenceStartRef.current = null;
        }
      };
      
      // Connect nodes
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);
      
      // Store references
      audioContextRef.current = audioContext;
      mediaStreamRef.current = stream;
      workletNodeRef.current = workletNode;
    setRecording(true);
      setError(null);
    } catch (err) {
      console.error('Recording error:', err);
      setError('Failed to access microphone');
    }
  };

  // Send chunk for local model
  const sendChunkLocal = async (chunkToSend: Float32Array, seq: number) => {
    const wavBlob = convertToWav([chunkToSend]);
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('language', language);
    formData.append('seq', String(seq));
    try {
      const response = await fetch('/api/local-transcribe', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        setError('Local transcription error');
        return;
      }
      const data = await response.json();
      if (data.transcription) {
        transcriptChunksRef.current[seq] = data.transcription;
        // Assemble transcript from all available chunks in order, skipping missing ones
        const keys = Object.keys(transcriptChunksRef.current).map(Number).sort((a, b) => a - b);
        let allText = '';
        for (const k of keys) {
          allText += (allText ? ' ' : '') + transcriptChunksRef.current[k];
        }
        // Fuzzy sentence deduplication and hallucination filtering
        const clean = (txt: string) => txt.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
        const splitSentences = (txt: string) => txt.match(/[^.!?]+[.!?]?/g)?.map(s => s.trim()) || [];
        const sentences = splitSentences(clean(allText));
        // List of known hallucinated/filler phrases (add more as needed)
        const hallucinated = [
          "Vielen Dank für's Zuschauen.",
          "Vielen Dank für's Zuhören!",
          "Das war's für heute, bis zum nächsten Mal.",
          "Bis zum nächsten Mal!"
        ];
        // Fuzzy deduplication
        function levenshtein(a: string, b: string) {
          const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
          for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
          for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
          for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
              matrix[i][j] = a[i - 1] === b[j - 1]
                ? matrix[i - 1][j - 1]
                : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
            }
          }
          return matrix[a.length][b.length];
        }
        function similarity(a: string, b: string) {
          if (!a || !b) return 0;
          const dist = levenshtein(a, b);
          return 1 - dist / Math.max(a.length, b.length);
        }
        const threshold = 0.75;
        const deduped = sentences.filter((s, i, arr) => {
          // Remove hallucinated/filler phrases
          if (hallucinated.some(h => similarity(s, h) > 0.8)) return false;
          // Fuzzy deduplication
          return i === 0 || similarity(s, arr[i - 1]) < threshold;
        });
        // Final word-level deduplication for repeated last words
        let transcriptText = deduped.join(' ').replace(/\s+/g, ' ').trim();
        const words = transcriptText.split(' ');
        if (words.length > 1 && words[words.length - 1].toLowerCase() === words[words.length - 2].toLowerCase()) {
          words.pop();
          transcriptText = words.join(' ');
        }
        setTranscript(transcriptText);
        lastSeqRef.current = keys.length ? keys[keys.length - 1] : -1;
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError('Local transcription error: ' + (err as Error).message);
    }
  };

  // Send chunk with overlap
  const sendChunkWithOverlap = async () => {
    const chunks = audioChunksRef.current;
    if (!chunks.length) return;
    // Flatten all chunks
    const flat = flattenChunks(chunks);
    // Calculate overlap samples
    const sampleRate = 16000;
    const overlapSamples = Math.floor(OVERLAP_SECONDS * sampleRate);
    // Prepare chunk to send (prepend overlap from previous send)
    let chunkToSend: Float32Array;
    if (overlapBufferRef.current) {
      const combined = new Float32Array(overlapBufferRef.current.length + flat.length);
      combined.set(overlapBufferRef.current, 0);
      combined.set(flat, overlapBufferRef.current.length);
      chunkToSend = combined;
    } else {
      chunkToSend = flat;
    }
    // Only send if chunk is long enough and not silent
    const minSamples = 16000 * 0.5; // 0.5 seconds at 16kHz
    const rms = Math.sqrt(chunkToSend.reduce((sum, v) => sum + v * v, 0) / chunkToSend.length);
    if (chunkToSend.length < minSamples || rms < SILENCE_THRESHOLD) {
      // Too short or silent, skip sending
      audioChunksRef.current = [];
      return;
    }
    // Update overlap buffer for next send
    overlapBufferRef.current = flat.slice(flat.length - overlapSamples);
    // Clear current chunks
    audioChunksRef.current = [];
    const seq = seqRef.current;
    seqRef.current += 1;
    if (model === 'local') {
      await sendChunkLocal(chunkToSend, seq);
      return;
    }
    // Convert to WAV and send
    const wavBlob = convertToWav([chunkToSend]);
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('language', language);
    try {
      const response = await fetch('/api/stream', {
        method: 'POST',
        body: formData,
      });
      if (!response.body) {
        setError('No response body from server');
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (chunk.startsWith('data:')) {
            try {
              const data = JSON.parse(chunk.slice(5).trim());
              if (data.transcription) {
                setTranscript(prev => {
                  const clean = (txt: string) => txt.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
                  const prevClean = prev ? clean(prev) : '';
                  const newClean = clean(data.transcription);
                  if (!prevClean) return newClean;

                  // Fuzzy sentence deduplication
                  const splitSentences = (txt: string) => txt.match(/[^.!?]+[.!?]?/g)?.map(s => s.trim()) || [];
                  const prevSentences = splitSentences(prevClean);
                  const newSentences = splitSentences(newClean);
                  if (!newSentences.length) return prevClean;

                  // Fuzzy compare last prev and first new
                  const lastPrev = prevSentences[prevSentences.length - 1];
                  const firstNew = newSentences[0];

                  // Simple similarity: normalized Levenshtein distance
                  function levenshtein(a: string, b: string) {
                    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
                    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
                    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
                    for (let i = 1; i <= a.length; i++) {
                      for (let j = 1; j <= b.length; j++) {
                        matrix[i][j] = a[i - 1] === b[j - 1]
                          ? matrix[i - 1][j - 1]
                          : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
                      }
                    }
                    return matrix[a.length][b.length];
                  }
                  function similarity(a: string, b: string) {
                    if (!a || !b) return 0;
                    const dist = levenshtein(a, b);
                    return 1 - dist / Math.max(a.length, b.length);
                  }

                  const threshold = 0.75; // 75% similar is considered a duplicate
                  let resultSentences = [...prevSentences];
                  if (similarity(lastPrev, firstNew) > threshold) {
                    // Only append the rest of the new sentences
                    resultSentences = resultSentences.slice(0, -1).concat(newSentences);
                  } else {
                    // Append all new sentences
                    resultSentences = resultSentences.concat(newSentences);
                  }
                  // Remove duplicates that may have crept in
                  const deduped = resultSentences.filter((s, i, arr) => i === 0 || similarity(s, arr[i - 1]) < threshold);
                  return deduped.join(' ').replace(/\s+/g, ' ').trim();
                });
              } else if (data.error) {
                setError(data.error);
              }
            } catch (err) {
              console.error('Error parsing SSE chunk:', err, chunk);
            }
          }
        }
      }
      // Only clear chunks if the request was successful
      console.log('Successfully sent audio chunk');
    } catch (err) {
      console.error('Error sending chunk:', err);
      setError('Error sending audio: ' + (err as Error).message);
    }
  };

  const convertToWav = (audioChunks: Float32Array[]): Blob => {
    const numChannels = 1;
    const sampleRate = 16000;
    const format = 1; // PCM
    const bitDepth = 16;
    
    // Calculate total length
    let totalLength = 0;
    for (const chunk of audioChunks) {
      totalLength += chunk.length;
    }
    
    // Create buffer
    const buffer = new ArrayBuffer(44 + totalLength * 2);
    const view = new DataView(buffer);
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalLength * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true);
    view.setUint16(32, numChannels * bitDepth / 8, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, totalLength * 2, true);
    
    // Write audio data
    let offset = 44;
    for (const chunk of audioChunks) {
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Draw waveform as efficient, clean bars from center line
  const drawWaveform = () => {
    const canvas = waveformRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const buffer = amplitudeBufferRef.current;
    const bars = WAVEFORM_BARS;
    const barWidth = WAVEFORM_BAR_WIDTH;
    const gap = WAVEFORM_BAR_GAP;
    const width = bars * (barWidth + gap);
    const height = WAVEFORM_HEIGHT;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    // Center line
    ctx.save();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.restore();
    // If no audio, just show center line
    if (!buffer.length) return;
    // Downsample buffer to bars
    const samplesPerBar = Math.max(1, Math.floor(buffer.length / bars));
    for (let i = 0; i < bars; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(buffer.length, (i + 1) * samplesPerBar);
      const slice = buffer.slice(start, end);
      // Use a power curve for more reactivity to small sounds
      const amp = slice.length ? Math.max(...slice) : 0;
      const scaledAmp = Math.pow(amp, 0.5);
      const barHeight = Math.max(4, scaledAmp * (height / 2) * 2.2);
      const x = i * (barWidth + gap);
      // Draw bar up
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + barWidth / 2, height / 2);
      ctx.lineTo(x + barWidth / 2, (height / 2) - barHeight);
      ctx.lineWidth = barWidth;
      ctx.strokeStyle = '#2563eb'; // Tailwind blue-600
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
      // Draw bar down
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + barWidth / 2, height / 2);
      ctx.lineTo(x + barWidth / 2, (height / 2) + barHeight);
      ctx.lineWidth = barWidth;
      ctx.strokeStyle = '#2563eb';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  };

  const stopRecording = () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    amplitudeBufferRef.current = [];
    drawWaveform();
    setRecording(false);
  };

  useEffect(() => {
    return () => {
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      amplitudeBufferRef.current = [];
      drawWaveform();
    };
  }, []);

  // Call EBM analysis API when transcript changes and is non-empty
  useEffect(() => {
    const analyze = async () => {
      if (!transcript.trim()) {
        setEbmResult(null);
        return;
      }
      try {
        const resp = await fetch('http://localhost:8000/search/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: transcript,
            code_type: 'EBM',
            limit: 10,
            embedding_model: 'distiluse',
            include_llm_analysis: false,
            relevance_method: 'hierarchical'
          })
        });
        if (!resp.ok) throw new Error('EBM analysis failed');
        const data = await resp.json();
        setEbmResult(data);
      } catch (e) {
        setEbmResult(null);
      }
    };
    analyze();
  }, [transcript]);

  // Parse marked_text markdown for highlights, always using the same color for each EBM code
  function renderMarkedTranscript(marked: string, codes: any[]) {
    if (!marked) return transcript;

    // Assign a color to each unique code
    const codeColors = ['#fde047', '#a7f3d0', '#fca5a5', '#93c5fd', '#fcd34d', '#fbbf24', '#f472b6', '#6ee7b7'];
    // Extract all codes from the marked text
    const codeRegex = /\[ebm code="([^"]+)" score="([^"]+)"\](.*?)\[\/ebm\]/g;
    const uniqueCodes = Array.from(new Set([...marked.matchAll(codeRegex)].map(m => m[1])));
    const codeColorMap = Object.fromEntries(uniqueCodes.map((code, idx) => [code, codeColors[idx % codeColors.length]]));

    // Split the marked text into parts (plain and ebm)
    const parts: any[] = [];
    let lastIndex = 0;
    let match;
    while ((match = codeRegex.exec(marked)) !== null) {
      if (match.index > lastIndex) {
        // Add plain text before this match
        parts.push(<span key={lastIndex}>{marked.slice(lastIndex, match.index)}</span>);
      }
      const code = match[1];
      const score = match[2];
      const text = match[3];
      const color = codeColorMap[code] || '#fde047';
      parts.push(
        <span
          key={code + '-' + match.index}
          style={{
            background: color,
            borderRadius: 4,
            padding: '0 2px',
            color: '#1e293b',
            fontWeight: 600,
            marginRight: 2,
          }}
          title={`EBM Code: ${code} (Score: ${score})`}
        >
          {text}
        </span>
      );
      lastIndex = codeRegex.lastIndex;
    }
    if (lastIndex < marked.length) {
      parts.push(<span key={lastIndex}>{marked.slice(lastIndex)}</span>);
    }
    return parts;
  }

  const generateMedicalSummary = async () => {
    if (!patientId) {
      setSummaryError('Please enter a patient ID before generating the summary');
      return;
    }
    if (!transcript) {
      setSummaryError('No transcription available to generate summary from');
      return;
    }

    setIsGeneratingSummary(true);
    setSummaryError(null);

    try {
      const response = await fetch('http://127.0.0.1:8002/api/medical-summary', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patient_id: patientId,
          conversation_id: `CONV-${Date.now()}`,
          patient_history: '', // We can add this later if needed
          conversation: transcript,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate medical summary');
      }

      const data = await response.json();
      setMedicalSummary(data);
      setActiveTab('summary');
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'Failed to generate medical summary');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // WebHID API: Request HID devices and log them
  const requestHIDDevices = async () => {
    const navAny = navigator as any;
    if (!('hid' in navAny)) {
      alert('WebHID API is not supported in this browser. Try Chrome.');
      return;
    }
    try {
      const devices = await navAny.hid.requestDevice({ filters: [] });
      console.log('WebHID devices:', devices);
      if (devices.length === 0) {
        alert('No HID devices found or access denied.');
      } else {
        alert(`Found ${devices.length} HID device(s). Check the console for details.`);
      }
    } catch (err) {
      alert('Error requesting HID devices: ' + err);
    }
  };

  // Listen for OSM09 HID button press and toggle recording
  const listenToHIDButton = async () => {
    const navAny = navigator as any;
    if (!('hid' in navAny)) {
      alert('WebHID API is not supported in this browser. Try Chrome.');
      return;
    }
    // OSM09: vendorId 6975, productId 8200
    const devices = await navAny.hid.requestDevice({ filters: [{ vendorId: 6975, productId: 8200 }] });
    if (devices.length === 0) {
      alert('No OSM09 device found.');
      return;
    }
    const device = devices[0];
    await device.open();
    device.oninputreport = (event: any) => {
      const value = event.data.getUint8(0);
      console.log('HID input report:', event);
      console.log('Raw data:', [value]);
      // Only toggle on a full press-and-release sequence: 128 (down), then 0 (up)
      if (value === 128) {
        hidPressActiveRef.current = true;
      } else if (value === 0 && hidPressActiveRef.current) {
        // Toggle recording on release after a press
        if (recording) {
          stopRecording();
        } else {
          startRecording();
        }
        hidPressActiveRef.current = false;
      }
      lastHIDValueRef.current = value;
    };
    alert('Listening for button presses on OSM09. Try pressing the button!');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center py-8">
      {/* Toolbar for model/language selection */}
      <div className="flex flex-row gap-6 mb-8 bg-white rounded-full shadow px-6 py-3 items-center">
        <div className="flex items-center gap-2">
          <label className="font-medium text-gray-700">Model:</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value as 'elevenlabs' | 'local')}
            className="rounded-full border border-gray-300 px-4 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          >
            <option value="elevenlabs">ElevenLabs</option>
            <option value="local">Local (Whisper)</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-medium text-gray-700">Language:</label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="rounded-full border border-gray-300 px-4 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          >
            {languageOptions.map(opt => (
              <option key={opt.code} value={opt.code}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-medium text-gray-700">Microphone:</label>
          <select
            value={selectedDeviceId}
            onChange={e => setSelectedDeviceId(e.target.value)}
            className="rounded-full border border-gray-300 px-4 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          >
            {audioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${device.deviceId}`}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-medium text-gray-700">Patient ID:</label>
          <input
            type="text"
            value={patientId}
            onChange={e => setPatientId(e.target.value)}
            placeholder="Enter patient ID"
            className="rounded-full border border-gray-300 px-4 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
        </div>
        <button
          onClick={requestHIDDevices}
          className="px-4 py-2 bg-gray-200 rounded-full text-gray-700 font-medium hover:bg-gray-300 transition"
          type="button"
        >
          Try WebHID
        </button>
        <button
          onClick={listenToHIDButton}
          className="px-4 py-2 bg-yellow-200 rounded-full text-gray-700 font-medium hover:bg-yellow-300 transition"
          type="button"
        >
          Listen for OSM09 Button
        </button>
        <div className={`flex items-center gap-2 ${recording ? 'text-green-600' : 'text-gray-400'}`}
             title={recording ? 'Recording is active' : 'Not recording'}>
          <span className={`inline-block w-3 h-3 rounded-full ${recording ? 'bg-green-500' : 'bg-gray-300'}`}></span>
          <span className="font-medium">{recording ? 'Recording' : 'Not Recording'}</span>
        </div>
      </div>

      <div className="max-w-3xl w-full mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-semibold text-gray-900">Voice Transcription</h2>
            <p className="text-gray-600">Click the button below to start recording your voice</p>
          </div>

          {/* Recording Button */}
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`
                relative px-8 py-4 rounded-full font-medium text-white transition-all duration-200
                ${recording 
                  ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200' 
                  : 'bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-200'
                }
              `}
            >
              {recording ? (
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                  </span>
                  Stop Recording
                </div>
              ) : (
                'Start Recording'
              )}
            </button>
            {/* Waveform visualization */}
            <div className="w-full flex justify-center mt-2">
              <canvas
                ref={waveformRef}
                style={{ width: `${WAVEFORM_BARS * (WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP)}px`, height: `${WAVEFORM_HEIGHT}px`, background: 'transparent', borderRadius: '14px', boxShadow: '0 2px 8px rgba(59,130,246,0.07)' }}
                width={WAVEFORM_BARS * (WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP)}
                height={WAVEFORM_HEIGHT}
              />
            </div>
          </div>

          {/* Status Indicator */}
          {recording && (
            <div className="text-center text-sm text-gray-600">
              Recording in progress...
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg">
              {error}
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('transcription')}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'transcription'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Transcription
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'summary'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Medical Summary
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'transcription' ? (
            <>
              {/* Transcript */}
              <div className="mt-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Transcript</h3>
                <div className="bg-gray-50 rounded-xl p-6 min-h-[200px]">
                  {transcript ? (
                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {transcript}
                    </p>
                  ) : (
                    <p className="text-gray-500 italic">No transcription yet. Start recording to see the text appear here.</p>
                  )}
                </div>
              </div>

              {/* ICD10 Codes Section */}
              {ebmResult && ebmResult.matches && ebmResult.matches.filter(c => c.relevance?.is_relevant).length > 0 && (() => {
                const relevantMatches = ebmResult.matches.filter(c => c.relevance?.is_relevant);
                const uniqueCodes = [...new Map(relevantMatches.map(c => [c.code, c])).values()].map(c => c.code);
                const codeColors = ['#fde047', '#a7f3d0', '#fca5a5', '#93c5fd', '#fcd34d', '#fbbf24', '#f472b6', '#6ee7b7'];
                const codeColorMap = Object.fromEntries(uniqueCodes.map((code, idx) => [code, codeColors[idx % codeColors.length]]));
                return (
                  <div className="mt-8">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">EBM Codes Found</h3>
                    <div className="bg-blue-50 rounded-xl p-6">
                      <ul className="space-y-4">
                        {[...new Map(relevantMatches.map(c => [c.code, c])).values()].map(code => (
                          <li key={code.code} className="">
                            <div className="font-semibold text-blue-800">
                              <span style={{ background: codeColorMap[code.code], borderRadius: 4, padding: '0 6px', color: '#1e293b', fontWeight: 700, marginRight: 6 }}>{code.code}</span>
                              {code.title}
                            </div>
                            <div className="text-gray-700 text-sm mb-1">{code.description}</div>
                            <div className="text-xs text-gray-500">Score: <span className="font-mono">{code.explanation?.final_score?.toFixed(2)}</span></div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}

              {/* Generate Summary Button */}
              {transcript && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={generateMedicalSummary}
                    disabled={isGeneratingSummary}
                    className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingSummary ? 'Generating Summary...' : 'Create Medical Summary'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="mt-8">
              {medicalSummary ? (
                <div className="space-y-8 bg-white rounded-xl shadow-lg p-8 border border-gray-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-4 border-b border-gray-200">
                    <div>
                      <label className="block text-base font-semibold text-gray-700 mb-1">Patient ID</label>
                      <input
                        type="text"
                        value={medicalSummary.patient_id}
                        disabled
                        className="mt-1 block w-full rounded-lg border border-gray-300 bg-gray-50 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 text-base cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-gray-700 mb-1">Conversation ID</label>
                      <input
                        type="text"
                        value={medicalSummary.conversation_id}
                        disabled
                        className="mt-1 block w-full rounded-lg border border-gray-300 bg-gray-50 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 text-base cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="space-y-6">
                    {Object.entries(medicalSummary)
                      .filter(([key]) => !['patient_id', 'conversation_id'].includes(key))
                      .map(([key, value]) => (
                        <div key={key}>
                          <label className="block text-base font-semibold text-gray-700 mb-2">
                            {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </label>
                          <textarea
                            value={value && value !== 'null' ? value : ''}
                            onChange={(e) => setMedicalSummary(prev => prev ? {
                              ...prev,
                              [key]: e.target.value
                            } : null)}
                            className="block w-full rounded-lg border border-gray-300 bg-gray-50 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 px-4 py-3 text-base min-h-[64px] transition-all placeholder-gray-400"
                            rows={4}
                            placeholder={`Enter ${key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  {isGeneratingSummary ? (
                    <p>Generating medical summary...</p>
                  ) : (
                    <p>No medical summary available. Please generate one from the transcription.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
