import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as Blob;

    if (!file) {
      return new NextResponse('No file provided', { status: 400 });
    }

    const eleven = new FormData();
    eleven.append('model_id', 'scribe_v1');      // Fixed model_id format
    eleven.append(
      'file',
      new Blob([await file.arrayBuffer()], { type: file.type }),
      'recording.webm'
    );

    const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVEN_API_KEY! },
      body: eleven
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('ElevenLabs API Error:', {
        status: resp.status,
        statusText: resp.statusText,
        error: errorText
      });
      return new NextResponse(errorText, { status: resp.status });
    }

    return NextResponse.json(await resp.json());
  } catch (error) {
    console.error('Transcription error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
