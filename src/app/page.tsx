import AudioRecorder from '@/components/AudioRecorder';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Professional Voice Transcription
          </h1>
          <p className="text-xl text-gray-600">
            Transform your voice into text with our advanced speech recognition technology
          </p>
        </div>
        <AudioRecorder />
      </div>
    </main>
  );
}
