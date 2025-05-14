'use client';

import { useRef, useState, useEffect, Fragment } from 'react';
import { MicrophoneIcon } from '@heroicons/react/24/solid';
import { 
  GlobeAltIcon, 
  Cog6ToothIcon, 
  DocumentMagnifyingGlassIcon, 
  ClipboardDocumentListIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon 
} from '@heroicons/react/24/outline';

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
const OVERLAP_SECONDS = 0; // 1 second overlap
const SILENCE_DURATION_MS = 700; // 700ms of silence to trigger send
const SILENCE_THRESHOLD = 0.01; // Adjust as needed for your mic/environment

// Praxie logo URL from https://www.praxie.berlin/
const PRAXIE_LOGO_URL = '/logo.svg';

// Simple translation object for German and English
const translations: Record<'de' | 'en', Record<string, string>> = {
  de: {
    appTitle: 'Praxie – Weniger Tippen, mehr Heilen.',
    model: 'Modell',
    language: 'Sprache',
    microphone: 'Mikrofon',
    patientId: 'Patienten-ID',
    notRecording: 'Nicht am Aufnehmen',
    recording: 'Aufnahme läuft',
    startRecording: 'Aufnahme starten',
    stopRecording: 'Aufnahme beenden',
    transcript: 'Transkript',
    noTranscript: 'Noch kein Transkript. Starten Sie die Aufnahme, um hier Text zu sehen.',
    codesFound: 'Vorgeschlagene EBM-Codes',
    summary: 'Medizinische Zusammenfassung',
    generateSummary: 'Zusammenfassung erstellen',
    generatingSummary: 'Erstelle Zusammenfassung...',
    noSummary: 'Noch keine Zusammenfassung verfügbar. Bitte aus dem Transkript generieren.',
    selectDevice: 'Gerät auswählen',
    selectLanguage: 'Sprache wählen',
    selectModel: 'Modell wählen',
    selectMicrophone: 'Mikrofon wählen',
    praxieSlogan: 'Durch KI den Praxis-Alltag erleichtern',
    praxieSubtitle: 'Smarte Praxie-Mikrofon: DSGVO-konformes Transkribieren & Zusammenfassen per KI auf Knopfdruck.',
    tabTranscription: 'Transkription',
    tabSummary: 'Medizinische Zusammenfassung',
    conversationId: 'Gesprächs-ID',
    copyField: 'Feld kopieren',
    copyAll: 'Alle Felder kopieren',
    copied: 'Kopiert!',
    copyAllSuccess: 'Alle Felder wurden kopiert!',
    anamnesis: 'Anamnese',
    chief_complaint: 'Hauptbeschwerde',
    physical_examination: 'Körperliche Untersuchung',
    assessment: 'Befund',
    plan: 'Behandlungsplan',
    doctor_specialisation: 'Arzt-Spezialisierung',
    speaker: 'Sprecher',
    at: 'um',
    elevenlabs_diarization: 'ElevenLabs (Diarization)',
  },
  en: {
    appTitle: 'Praxie – Less Typing, More Healing.',
    model: 'Model',
    language: 'Language',
    microphone: 'Microphone',
    patientId: 'Patient ID',
    notRecording: 'Not Recording',
    recording: 'Recording',
    startRecording: 'Start Recording',
    stopRecording: 'Stop Recording',
    transcript: 'Transcript',
    noTranscript: 'No transcript yet. Start recording to see text here.',
    codesFound: 'Suggested EBM Codes',
    summary: 'Medical Summary',
    generateSummary: 'Create Summary',
    generatingSummary: 'Generating summary...',
    noSummary: 'No summary available yet. Please generate from the transcript.',
    selectDevice: 'Select Device',
    selectLanguage: 'Select Language',
    selectModel: 'Select Model',
    selectMicrophone: 'Select Microphone',
    praxieSlogan: 'AI makes your practice easier',
    praxieSubtitle: 'Smart Praxie Microphone: GDPR-compliant transcription & summarization at the touch of a button.',
    tabTranscription: 'Transcription',
    tabSummary: 'Medical Summary',
    conversationId: 'Conversation ID',
    copyField: 'Copy field',
    copyAll: 'Copy all fields',
    copied: 'Copied!',
    copyAllSuccess: 'All fields have been copied!',
    anamnesis: 'Anamnesis',
    chief_complaint: 'Chief Complaint',
    physical_examination: 'Physical Examination',
    assessment: 'Assessment',
    plan: 'Treatment Plan',
    doctor_specialisation: 'Doctor Specialization',
    speaker: 'Speaker',
    at: 'at',
    elevenlabs_diarization: 'ElevenLabs (Diarization)',
  }
};

type Language = 'de' | 'en';

// IconButton with popover menu
function IconMenu({ icon, options, value, onSelect, tooltip, renderOption, getKey, getIcon, keyField = 'code' }: {
  icon: React.ReactNode,
  options: any[],
  value: any,
  onSelect: (v: any) => void,
  tooltip: string,
  renderOption?: (v: any) => React.ReactNode,
  getKey?: (v: any, i: number) => string,
  getIcon?: (v: any) => React.ReactNode,
  keyField?: string,
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [justSelected, setJustSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent | TouchEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const getOptionKey = (opt: any, i: number) => opt.code || opt.deviceId || String(i);
  const selected = (opt: any) => getOptionKey(opt, 0) === getOptionKey(value, 0);
  return (
    <div className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        style={{
          background: open || selected(value) ? '#54A9E1' : '#f3f4f6',
          borderColor: '#54A9E1',
          color: open || selected(value) ? '#fff' : '#54A9E1',
          borderWidth: 2,
          borderStyle: 'solid',
          borderRadius: '9999px',
          width: 56,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s, color 0.2s'
        }}
        onClick={() => { setOpen(o => !o); setJustSelected(null); }}
        aria-label={tooltip}
        title={tooltip}
      >
        <span>{icon}</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute z-40 left-1/2 -translate-x-1/2 mt-3 min-w-[260px] max-w-[340px] px-2 bg-white border border-gray-100 rounded-2xl shadow-lg py-3 ring-1 ring-black ring-opacity-5 animate-fadeIn max-h-80 overflow-auto flex flex-col"
          style={{ boxShadow: '0 6px 24px 0 rgba(16,30,54,0.10), 0 1.5px 4px 0 rgba(59,130,246,0.06)' }}
        >
          {options.map((opt, i) => {
            const isSelected = keyField === 'deviceId' ? opt.deviceId === value : getOptionKey(opt, i) === getOptionKey(value, i);
            return (
              <button
                key={getKey ? getKey(opt, i) : (opt.code || opt.deviceId || String(i))}
                style={{
                  background: isSelected ? '#54A9E1' : '#fff',
                  color: isSelected ? '#fff' : '#54A9E1',
                  borderColor: '#54A9E1',
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderRadius: 16,
                  padding: '1rem 1.5rem',
                  margin: '0.25rem 0',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'background 0.2s, color 0.2s'
                }}
                className="flex items-center gap-3 w-full justify-start transition-colors"
                onMouseOver={e => {
                  if (!isSelected) e.currentTarget.style.background = '#eaf6fc';
                }}
                onMouseOut={e => {
                  if (!isSelected) e.currentTarget.style.background = '#fff';
                }}
                onClick={() => { onSelect(opt); setOpen(false); }}
                tabIndex={0}
                type="button"
              >
                <span>{getIcon ? getIcon(opt) : icon}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={opt.displayLabel}>
                  {renderOption ? renderOption(opt) : opt.label || opt}
                </span>
                {isSelected && (
                  <ClipboardDocumentCheckIcon className="h-5 w-5 ml-auto text-white" />
                )}
              </button>
            );
          })}
        </div>
      )}
      <style jsx>{`
        .animate-fadeIn { animation: fadeIn 0.18s cubic-bezier(.4,0,.2,1); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
        @media (max-width: 640px) {
          .z-40 { min-width: 96vw !important; left: 2vw !important; right: 2vw !important; }
        }
      `}</style>
    </div>
  );
}

// Update the DiarizedSegment type to handle both local and ElevenLabs formats
type DiarizedSegment = {
  speaker: number | string;
  start: number;
  end: number;
  text: string;
};

// Add type for speaker style
type SpeakerStyle = {
  position: string;
  background: string;
  border: string;
  textColor: string;
};

// Add speaker styling constants with proper typing
const SPEAKER_STYLES: Record<number, SpeakerStyle> = {
  0: { 
    position: 'justify-start',
    background: 'bg-white',
    border: 'border-[#54A9E1]',
    textColor: 'text-[#54A9E1]'
  },
  1: { 
    position: 'justify-end',
    background: 'bg-[#eaf6fc]',
    border: 'border-[#54A9E1]',
    textColor: 'text-[#54A9E1]'
  },
  2: { 
    position: 'justify-start pl-8',
    background: 'bg-[#f0fdf4]',
    border: 'border-emerald-500',
    textColor: 'text-emerald-600'
  },
  3: { 
    position: 'justify-end pr-8',
    background: 'bg-[#fef2f2]',
    border: 'border-rose-500',
    textColor: 'text-rose-600'
  }
};

export default function AudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [pendingTranscript, setPendingTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<'elevenlabs' | 'local' | 'local-diarization' | 'elevenlabs-diarization'>('elevenlabs');
  const [language, setLanguage] = useState<Language>('de');
  const t = translations[language];
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
  const [patientId, setPatientId] = useState<string>('2025');
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
  const [hidListening, setHidListening] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const [diarizedSegments, setDiarizedSegments] = useState<DiarizedSegment[] | null>(null);
  // Add new state for storing audio chunks for cumulative diarization
  const cumulativeAudioChunksRef = useRef<Float32Array[]>([]);

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

  // Fetch available audio input devices and HID devices
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.mediaDevices) return;

    const getAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
        console.log('Audio devices:', audioInputs);
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

  // Automatically listen for OSM09 HID button if present and permission is granted
  useEffect(() => {
    const listenForOSM09 = async () => {
      const navAny = navigator as any;
      if (!('hid' in navAny)) return;
      try {
        // Get all HID devices the user has already granted access to
        const devices = await navAny.hid.getDevices();
        const osm09 = devices.find((d: any) => d.productName === 'OSM09');
        if (osm09 && !hidListening) {
          await osm09.open();
          osm09.oninputreport = (event: any) => {
            const value = event.data.getUint8(0);
            console.log('HID input report:', event);
            console.log('Raw data:', [value]);
            // Only toggle on a full press-and-release sequence: 128 (down), then 0 (up)
            if (value === 128) {
              hidPressActiveRef.current = true;
            } else if (value === 0 && hidPressActiveRef.current) {
              if (recording) {
                stopRecording();
              } else {
                startRecording();
              }
              hidPressActiveRef.current = false;
            }
            lastHIDValueRef.current = value;
          };
          setHidListening(true);
        }
      } catch (err) {
        // Optionally handle error
      }
    };
    listenForOSM09();
    // Optionally, re-run if recording state changes (to keep in sync)
  }, [recording, hidListening]);

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Audio recording is not supported in this browser.');
      return;
    }
    try {
      // Reset all state
      seqRef.current = 0;
      transcriptChunksRef.current = {};
      setDiarizedSegments(null);
      cumulativeAudioChunksRef.current = []; // Reset cumulative audio chunks
      
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
      setError('Could not access microphone: ' + (err as Error).message);
      // Optionally, log the error for debugging
      console.error('getUserMedia error:', err);
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
      if (model === 'local-diarization') {
        const response = await fetch('/api/local-transcribe-diarization', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          setError('Local transcription error');
          return;
        }
        const data = await response.json();
        if (data.segments) {
          setDiarizedSegments(prevSegments => {
            if (!prevSegments) return data.segments;
            return [...prevSegments, ...data.segments];
          });
          setTranscript('');
        } else if (data.transcription) {
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
      } else {
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
          setTranscript(data.transcription);
          lastSeqRef.current = data.seq;
        } else if (data.error) {
          setError(data.error);
        }
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

    if (model === 'local' || model === 'local-diarization') {
      await sendChunkLocal(chunkToSend, seq);
      return;
    }

    if (model === 'elevenlabs-diarization') {
      // Store the current chunk for cumulative processing
      cumulativeAudioChunksRef.current.push(chunkToSend);
      
      // Concatenate all audio chunks into a single Float32Array
      const totalLength = cumulativeAudioChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
      const concatenatedAudio = new Float32Array(totalLength);
      let offset = 0;
      
      // Copy each chunk into the concatenated array in order
      for (const chunk of cumulativeAudioChunksRef.current) {
        concatenatedAudio.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Create WAV blob from the concatenated audio
      const cumulativeWavBlob = convertToWav([concatenatedAudio]);
      
      // Send the concatenated audio
      const formData = new FormData();
      formData.append('file', cumulativeWavBlob, 'audio.wav');
      formData.append('language', language);
      
      try {
        const response = await fetch('/api/stream-diarization', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          setError('Diarization error from ElevenLabs');
          return;
        }
        
        const data = await response.json();
        if (data.segments) {
          setDiarizedSegments(data.segments);
          setTranscript('');
        } else if (data.error) {
          setError(data.error);
        }
      } catch (err) {
        setError('Diarization error: ' + (err as Error).message);
      }
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
      ctx.strokeStyle = '#54A9E1';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
      // Draw bar down
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + barWidth / 2, height / 2);
      ctx.lineTo(x + barWidth / 2, (height / 2) + barHeight);
      ctx.lineWidth = barWidth;
      ctx.strokeStyle = '#54A9E1';
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
    const codeColorMap = Object.fromEntries(uniqueCodes.map((code) => [code, '#54A9E1']));

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
            color: '#fff',
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
      const response = await fetch('http://127.0.0.1:8000/medical-summary/', {
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

  // Add these helper functions
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  };

  const copyAllFields = async () => {
    if (!medicalSummary) return;
    
    const fields = Object.entries(medicalSummary)
      .filter(([key]) => !['patient_id', 'conversation_id'].includes(key))
      .map(([key, value]) => {
        const label = t[key as keyof typeof t] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `${label}:\n${value || ''}\n`;
      })
      .join('\n');

    const success = await copyToClipboard(fields);
    if (success) {
      setCopyAllSuccess(true);
      setTimeout(() => setCopyAllSuccess(false), 2000);
    }
  };

  const formatTimestamp = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center py-4 sm:py-8">
      {/* Tab Navigation (moved above main content) */}
      <div className="w-full max-w-6xl mx-auto mb-2">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('transcription')}
            style={{
              color: activeTab === 'transcription' ? '#54A9E1' : '#6B7280',
              borderBottom: activeTab === 'transcription' ? '2px solid #54A9E1' : '2px solid transparent',
              background: 'transparent'
            }}
            className={`px-4 py-2 font-medium text-xl md:text-lg ${
              activeTab === 'transcription'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.tabTranscription}
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            style={{
              color: activeTab === 'summary' ? '#54A9E1' : '#6B7280',
              borderBottom: activeTab === 'summary' ? '2px solid #54A9E1' : '2px solid transparent',
              background: 'transparent'
            }}
            className={`px-4 py-2 font-medium text-xl md:text-lg ${
              activeTab === 'summary'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.tabSummary}
          </button>
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-8 w-full max-w-6xl mx-auto">
        {/* Left: Transcript/summary (2/3) */}
        <div className="w-full md:w-2/3">
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-8 h-full flex flex-col">
            {/* Only show the relevant tab content */}
            {activeTab === 'transcription' ? (
              <>
                {/* Waveform and Recording Button in a row */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-8 w-full">
                  {/* Waveform area */}
                  <div className="relative flex-1 flex items-center justify-center w-full max-w-[500px] pl-2">
                    <canvas
                      ref={waveformRef}
                      style={{
                        width: '100%',
                        height: `${WAVEFORM_HEIGHT}px`,
                        background: 'transparent',
                        borderRadius: '14px',
                        boxShadow: '0 2px 8px rgba(59,130,246,0.07)'
                      }}
                      width={500}
                      height={WAVEFORM_HEIGHT}
                    />
                    {/* Empty state overlay */}
                    {(!recording && amplitudeBufferRef.current.length === 0) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <MicrophoneIcon className="h-8 w-8 text-blue-200 mb-2" />
                        <span className="text-gray-400 text-sm">
                          {language === 'de' ? 'Kein Signal' : 'No signal'}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Recording Button */}
                  <div className="flex-shrink-0 pr-2">
                    <button
                      onClick={recording ? stopRecording : startRecording}
                      style={{
                        background: recording ? '#E53E3E' : '#54A9E1',
                        color: '#fff',
                        border: 'none',
                        boxShadow: !recording ? '0 2px 8px #54A9E1' : undefined,
                        borderRadius: '9999px',
                        padding: '1rem 2rem',
                        fontWeight: 500,
                        fontSize: '1.125rem',
                        transition: 'background 0.2s',
                        cursor: 'pointer'
                      }}
                      onMouseOver={e => {
                        if (!recording) e.currentTarget.style.background = '#3993C6';
                      }}
                      onMouseOut={e => {
                        if (!recording) e.currentTarget.style.background = '#54A9E1';
                      }}
                    >
                      {recording && (
                        <span style={{ position: 'relative', display: 'inline-block', width: 16, height: 16, marginRight: 12, verticalAlign: 'middle' }}>
                          <span style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            borderRadius: '50%',
                            background: '#E53E3E',
                            opacity: 0.5,
                            animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
                          }} />
                          <span style={{
                            position: 'absolute',
                            top: 4, left: 4, width: 8, height: 8,
                            borderRadius: '50%',
                            background: '#E53E3E',
                            boxShadow: '0 0 0 2px #fff',
                          }} />
                        </span>
                      )}
                      {recording ? t.stopRecording : t.startRecording}
                    </button>
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
                {/* Transcript */}
                <div className="mt-8 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">{t.transcript}</h3>
                  <div className="bg-gray-50 rounded-xl p-6 min-h-[200px] overflow-y-auto max-h-[600px]">
                    {diarizedSegments && (model === 'local-diarization' || model === 'elevenlabs-diarization') ? (
                      <div className="space-y-4">
                        {diarizedSegments.map((seg: DiarizedSegment, i: number) => {
                          // Convert speaker to number if it's a string (ElevenLabs format)
                          const speakerNum = typeof seg.speaker === 'string' 
                            ? parseInt(seg.speaker.replace(/[^\d]/g, ''), 10) || 0
                            : seg.speaker;
                          
                          // Get style for this speaker (mod 4 to support up to 4 speakers)
                          const style = SPEAKER_STYLES[speakerNum % 4];
                          
                          return (
                            <div key={i} className={`flex ${style.position}`}> 
                              <div 
                                className={`
                                  max-w-[80%] rounded-2xl px-4 py-3 
                                  ${style.background}
                                  transition-all duration-200 hover:shadow-md
                                  border-2
                                `}
                                style={{ 
                                  borderColor: style.border.replace('border-', '').startsWith('#') 
                                    ? style.border.replace('border-', '')
                                    : `var(--${style.border.replace('border-', '')}-500)`
                                }}
                              >
                                <div className="flex items-center gap-2 mb-1 text-xs text-gray-500">
                                  <span className={`font-semibold ${style.textColor}`}>
                                    {t.speaker} {speakerNum + 1}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {t.at} {formatTimestamp(seg.start)}–{formatTimestamp(seg.end)}
                                  </span>
                                </div>
                                <div className="text-gray-900 text-base whitespace-pre-line break-words">
                                  {seg.text}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {transcript || (
                          <span className="text-gray-400 italic">
                            {t.noTranscript}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col justify-start">
                {medicalSummary ? (
                  <div className="space-y-8 bg-white rounded-xl shadow-lg p-8 border border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-4 border-b border-gray-200">
                      <div>
                        <label className="block text-base font-semibold text-gray-700 mb-1">{t.patientId}</label>
                        <input
                          type="text"
                          value={medicalSummary.patient_id}
                          disabled
                          className="mt-1 block w-full rounded-lg border border-gray-300 bg-gray-50 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 text-base cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-base font-semibold text-gray-700 mb-1">{t.conversationId}</label>
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
                          <div key={key} className="relative">
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-base font-semibold text-gray-700">
                                {t[key as keyof typeof t] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </label>
                              <button
                                onClick={async () => {
                                  const success = await copyToClipboard(value || '');
                                  if (success) {
                                    setCopiedField(key);
                                    setTimeout(() => setCopiedField(null), 2000);
                                  }
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-blue-600 transition-colors rounded-lg hover:bg-gray-50"
                                title={t.copyField}
                              >
                                {copiedField === key ? (
                                  <>
                                    <ClipboardDocumentCheckIcon className="h-4 w-4 text-green-500" />
                                    <span className="text-green-500">{t.copied}</span>
                                  </>
                                ) : (
                                  <ClipboardDocumentIcon className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                            <textarea
                              value={value && value !== 'null' ? value : ''}
                              onChange={(e) => setMedicalSummary(prev => prev ? {
                                ...prev,
                                [key]: e.target.value
                              } : null)}
                              className="block w-full rounded-lg border border-gray-300 bg-gray-50 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 px-4 py-3 text-base min-h-[64px] transition-all placeholder-gray-400"
                              rows={4}
                              placeholder={t[key as keyof typeof t] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            />
                          </div>
                        ))}
                      
                      {/* Add Copy All button */}
                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={copyAllFields}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                            ${copyAllSuccess 
                              ? 'bg-green-100 text-green-700 border border-green-200' 
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                            }`}
                        >
                          {copyAllSuccess ? (
                            <>
                              <ClipboardDocumentCheckIcon className="h-5 w-5" />
                              <span>{t.copyAllSuccess}</span>
                            </>
                          ) : (
                            <>
                              <ClipboardDocumentIcon className="h-5 w-5" />
                              <span>{t.copyAll}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <ClipboardDocumentListIcon className="h-14 w-14 text-blue-200 mb-4" />
                    <div className="text-blue-900 text-lg font-semibold mb-2">
                      {language === 'de' ? 'Noch keine Zusammenfassung verfügbar.' : 'No summary available yet.'}
                    </div>
                    <div className="text-gray-500 text-base mb-6">
                      {language === 'de'
                        ? 'Bitte erstellen Sie eine Zusammenfassung aus dem Transkript.'
                        : 'Please generate a summary from the transcript.'}
                    </div>
                    <button
                      onClick={generateMedicalSummary}
                      disabled={!transcript || isGeneratingSummary}
                      className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGeneratingSummary ? t.generatingSummary : t.generateSummary}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Right: Settings (top) + EBM codes (bottom) (1/3) */}
        <div className="w-full md:w-1/3 flex flex-col gap-8">
          {/* Settings Box (no header) */}
          <div className="bg-white rounded-2xl shadow-lg p-8 flex flex-col gap-6">
            <div className="flex flex-row flex-wrap gap-6 items-center justify-center">
              <IconMenu
                icon={<Cog6ToothIcon className="h-7 w-7" />}
                options={[
                  { code: 'elevenlabs', label: 'ElevenLabs', icon: <Cog6ToothIcon className="h-6 w-6" /> },
                  { code: 'local', label: 'Whisper', icon: <Cog6ToothIcon className="h-6 w-6" /> },
                  { code: 'local-diarization', label: 'Whisper (Diarization)', icon: <Cog6ToothIcon className='h-6 w-6' /> },
                  { code: 'elevenlabs-diarization', label: 'ElevenLabs (Diarization)', icon: <Cog6ToothIcon className='h-6 w-6' /> },
                ]}
                value={{ code: model, label: model === 'elevenlabs' ? 'ElevenLabs' : model === 'local' ? 'Whisper' : model === 'local-diarization' ? 'Whisper (Diarization)' : 'ElevenLabs (Diarization)' }}
                onSelect={opt => setModel(opt.code)}
                tooltip={t.model}
                renderOption={opt => opt.label}
                getKey={(opt, i) => opt.code || String(i)}
                getIcon={opt => opt.icon}
              />
              <IconMenu
                icon={<GlobeAltIcon className="h-7 w-7" />}
                options={languageOptions.map(opt => ({ ...opt, icon: <GlobeAltIcon className="h-6 w-6" /> }))}
                value={languageOptions.find(opt => opt.code === language) || languageOptions[0]}
                onSelect={opt => setLanguage(opt.code as Language)}
                tooltip={t.language}
                renderOption={opt => opt.label}
                getKey={(opt, i) => opt.code || String(i)}
                getIcon={opt => opt.icon}
              />
              <IconMenu
                icon={<MicrophoneIcon className="h-7 w-7" />}
                options={audioDevices.map((d, i) => ({
                  ...d,
                  icon: <MicrophoneIcon className="h-6 w-6" />,
                  displayLabel: d.label && d.label.trim() ? d.label : `${t.microphone} ${i + 1}`
                }))}
                value={(() => {
                  const found = audioDevices.find(d => d.deviceId === selectedDeviceId);
                  if (found) {
                    return {
                      ...found,
                      icon: <MicrophoneIcon className="h-6 w-6" />,
                      displayLabel: found.label && found.label.trim() ? found.label : `${t.microphone} ${audioDevices.indexOf(found) + 1}`
                    };
                  }
                  return { displayLabel: t.microphone, deviceId: '', icon: <MicrophoneIcon className="h-6 w-6" /> };
                })()}
                onSelect={opt => setSelectedDeviceId(opt.deviceId)}
                tooltip={t.microphone}
                renderOption={opt => opt.displayLabel}
                getKey={(opt, i) => opt.deviceId || String(i)}
                getIcon={opt => opt.icon}
                keyField='deviceId'
              />
              {/* Patient ID input (unchanged) */}
              <div className="flex flex-col items-center w-full sm:w-auto">
                <span className="font-medium text-gray-700 mb-1">{t.patientId}</span>
                <input
                  type="text"
                  value={patientId}
                  onChange={e => setPatientId(e.target.value)}
                  placeholder={t.patientId}
                  className="rounded-full border border-gray-300 px-4 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 transition w-full sm:w-auto"
                />
              </div>
            </div>
          </div>
          {/* EBM Codes Box */}
          <div className="bg-blue-50 rounded-2xl shadow-lg p-6 min-h-[220px] flex flex-col">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{t.codesFound}</h3>
            {ebmResult && ebmResult.matches && ebmResult.matches.filter(c => c.relevance?.is_relevant).length > 0 ? (() => {
              const relevantMatches = ebmResult.matches.filter(c => c.relevance?.is_relevant);
              const uniqueCodes = [...new Map(relevantMatches.map(c => [c.code, c])).values()].map(c => c.code);
              const codeColors = ['#fde047', '#a7f3d0', '#fca5a5', '#93c5fd', '#fcd34d', '#fbbf24', '#f472b6', '#6ee7b7'];
              const codeColorMap = Object.fromEntries(uniqueCodes.map((code) => [code, '#54A9E1']));
              return (
                <ul className="space-y-4">
                  {[...new Map(relevantMatches.map(c => [c.code, c])).values()].map(code => (
                    <li key={code.code} className="">
                      <div className="font-semibold text-blue-800 flex items-center gap-2">
                        <span style={{
                          background: '#54A9E1',
                          color: '#fff',
                          borderRadius: 4,
                          padding: '0 6px',
                          fontWeight: 700
                        }}>
                          {code.code}
                        </span>
                        <span>{code.title}</span>
                      </div>
                      <div className="text-gray-700 text-sm mb-1">{code.description}</div>
                      <div className="text-xs text-gray-500">Score: <span className="font-mono">{code.explanation?.final_score?.toFixed(2)}</span></div>
                    </li>
                  ))}
                </ul>
              );
            })() : (
              <div className="flex flex-1 flex-col items-center justify-center text-center py-8">
                <DocumentMagnifyingGlassIcon className="h-12 w-12 text-blue-300 mb-4" />
                <div className="text-blue-900 text-base font-medium mb-1">
                  {language === 'de' ? 'Noch keine EBM-Codes gefunden.' : 'No EBM codes found yet.'}
                </div>
                <div className="text-gray-500 text-sm">
                  {language === 'de'
                    ? 'Die Analyse startet automatisch, sobald ein Transkript vorliegt.'
                    : 'Analysis will start automatically once a transcript is available.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style jsx>{`
        .blinking-dot { animation: blinker 1s linear infinite; }
        @keyframes blinker { 50% { opacity: 0.3; } }
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
      `}</style>
    </div>
  );
}
