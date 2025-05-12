'use client';

import { useState, useRef, useEffect } from 'react';

export default function TranscriptionInterface() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        try {
          console.log('Sending audio to server...');
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.webm');
          
          const response = await fetch('/api/stream', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.text();
            console.error('Server error:', error);
            setError('Server error: ' + error);
            return;
          }

          const data = await response.json();
          if (data.text) {
            console.log('Received transcription:', data.text);
            setTranscription(prev => prev + ' ' + data.text);
          }
        } catch (err) {
          console.error('Error sending audio:', err);
          setError('Error sending audio: ' + (err as Error).message);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error('Recording error:', err);
      setError('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="space-y-6">
        <div className="flex justify-center">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-6 py-3 rounded-full text-white font-semibold transition-colors ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-600 rounded-lg">
            {error}
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-4 min-h-[200px]">
          <p className="text-gray-700 whitespace-pre-wrap">
            {transcription || 'Transcription will appear here...'}
          </p>
        </div>
      </div>
    </div>
  );
} 