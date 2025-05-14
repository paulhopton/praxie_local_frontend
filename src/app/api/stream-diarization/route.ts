import { NextRequest } from 'next/server';

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const language = (formData.get('language') as string) || 'de';
    if (!file || !(file instanceof Blob) || file.size === 0) {
      return new Response(JSON.stringify({ error: 'No audio data received' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const arrayBuffer = await file.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
    const elevenLabsApiKey = process.env.ELEVEN_API_KEY || 'YOUR_ELEVENLABS_API_KEY';
    const elevenLabsUrl = 'https://api.elevenlabs.io/v1/speech-to-text';
    const elevenFormData = new FormData();
    elevenFormData.append('file', audioBlob, 'audio.wav');
    elevenFormData.append('model_id', 'scribe_v1');
    elevenFormData.append('diarize', 'true');
    elevenFormData.append('language_code', language);

    let resp;
    try {
      resp = await fetch(elevenLabsUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
        },
        body: elevenFormData,
      });
    } catch (apiErr) {
      return new Response(JSON.stringify({ error: 'Network error calling ElevenLabs API', details: String(apiErr) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: 'ElevenLabs API error', status: resp.status, body: errText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    let data;
    try {
      data = await resp.json();
    } catch (jsonErr) {
      return new Response(JSON.stringify({ error: 'Failed to parse ElevenLabs response as JSON', details: String(jsonErr) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Improved grouping: group by speaker_id, add spaces, handle missing speaker_id
    if (data.words && Array.isArray(data.words)) {
      const segments = [];
      let currentSpeaker = null;
      let currentSegment = null;
      for (const word of data.words) {
        const speaker = word.speaker_id || 'Speaker 1';
        if (speaker !== currentSpeaker) {
          if (currentSegment) segments.push(currentSegment);
          currentSpeaker = speaker;
          currentSegment = {
            speaker: speaker,
            start: word.start,
            end: word.end,
            text: word.text,
          };
        } else if (currentSegment) {
          // Add a space before the next word if needed
          if (currentSegment.text && !currentSegment.text.endsWith(' ')) {
            currentSegment.text += ' ';
          }
          currentSegment.text += word.text;
          currentSegment.end = word.end;
        }
      }
      if (currentSegment) segments.push(currentSegment);

      return new Response(JSON.stringify({ segments }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: 'No words in ElevenLabs response.', data }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 