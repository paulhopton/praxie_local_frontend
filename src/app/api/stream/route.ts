import { NextRequest } from 'next/server';
import { fetch } from 'undici';
import FormData from 'form-data';

// Store the last transcription for new SSE connections
let lastTranscription = '';

// Common headers for all responses
const commonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function OPTIONS() {
  return new Response(null, {
    headers: commonHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    console.log('Received audio data request');
    
    // Get the audio data from the request
    const formDataReq = await req.formData();
    const file = formDataReq.get('file');
    const language = formDataReq.get('language') || 'de';
    if (!file || !(file instanceof Blob) || file.size === 0) {
      return new Response(JSON.stringify({ error: 'No audio data received' }), {
        status: 400,
        headers: { ...commonHeaders, 'Content-Type': 'application/json' },
      });
    }
    const arrayBuffer = await file.arrayBuffer();
    const formData = new FormData();
    formData.append('file', Buffer.from(arrayBuffer), {
      filename: 'audio.wav',
      contentType: 'audio/wav',
    });
    formData.append('model_id', 'scribe_v1');
    formData.append('language', language);
    
    console.log('Sending request to ElevenLabs with model_id:', 'scribe_v1');
    
    // Forward the request to ElevenLabs
    const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVEN_API_KEY!,
        ...formData.getHeaders(),
      },
      body: formData.getBuffer(),
    });

    console.log('ElevenLabs API response status:', resp.status);
    console.log('ElevenLabs API response headers:', Object.fromEntries(resp.headers.entries()));

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('ElevenLabs API error:', errorText);
      return new Response(JSON.stringify({ error: errorText }), {
        status: resp.status,
        headers: {
          ...commonHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Create a TransformStream to handle the response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Start processing the response
    (async () => {
      try {
        const reader = resp.body?.getReader();
        if (!reader) {
          console.error('No response body from ElevenLabs');
          await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`));
          await writer.close();
          return;
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Finished reading ElevenLabs response');
            break;
          }

          // Convert the chunk to text and send it to the client
          const text = new TextDecoder().decode(value);
          console.log('Raw chunk from ElevenLabs:', text);
          
          const lines = text.split('\n\n').filter(line => line.trim());
          console.log('Processed lines:', lines);
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const transcriptionData = JSON.parse(line.trim());
                if (transcriptionData.text) {
                  console.log('Sending transcription text:', transcriptionData.text);
                  lastTranscription = transcriptionData.text;
                  // Send a simple object with just the text
                  await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ transcription: transcriptionData.text })}\n\n`));
                }
              } catch (error) {
                console.error('Error parsing transcription line:', error);
                console.error('Raw line:', line);
              }
            }
          }
        }

        await writer.close();
      } catch (error) {
        console.error('Streaming error:', error);
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ error: 'Streaming error' })}\n\n`));
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...commonHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Server error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        ...commonHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
}

export async function GET() {
  // Optional: keep a simple ping for debugging
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  setInterval(async () => {
    await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ ping: true })}\n\n`));
  }, 30000);
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 