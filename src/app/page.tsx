import AudioRecorder from '@/components/AudioRecorder';

// Praxie logo URL (should match AudioRecorder)
const PRAXIE_LOGO_URL = '/logo.svg';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-0 sm:py-0 flex flex-col items-center">
      {/* Praxie Logo at the very top */}
      <div className="w-full flex flex-col items-center pt-6 pb-2">
        <img src={PRAXIE_LOGO_URL} alt="Praxie Logo" className="h-16 mb-2" style={{maxWidth: 180}} />
      </div>
      <div className="container mx-auto px-4">
        <AudioRecorder />
      </div>
    </main>
  );
}
