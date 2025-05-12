import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  console.log('--- /api/local-transcribe POST handler called ---');
  try {
    const formData = await req.formData();
    console.log('FormData received');
    const file = formData.get('file');
    const language = (formData.get('language') as string) || 'de';
    console.log('Language:', language);
    if (!file || !(file instanceof Blob) || file.size === 0) {
      console.log('No file or empty file');
      return new Response(JSON.stringify({ error: 'No audio data received' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const arrayBuffer = await file.arrayBuffer();
    console.log('ArrayBuffer length:', arrayBuffer.byteLength);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-stt-'));
    const tempFile = path.join(tempDir, 'audio.wav');
    await fs.writeFile(tempFile, Buffer.from(arrayBuffer));
    console.log('Temp file written:', tempFile);

    const pythonPath = 'python3';
    const scriptPath = path.resolve(process.cwd(), 'local_transcribe.py');
    console.log('About to call Python:', scriptPath, tempFile, language);
    const result = spawnSync(pythonPath, [scriptPath, tempFile, language], { encoding: 'utf-8' });

    console.log('PYTHON STDOUT:', result.stdout);
    console.log('PYTHON STDERR:', result.stderr);
    console.log('PYTHON STATUS:', result.status);
    console.log('PYTHON ERROR:', result.error);

    await fs.unlink(tempFile);
    await fs.rmdir(tempDir);

    if (result.error) {
      console.log('Returning error:', result.error.message);
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (result.status !== 0) {
      console.log('Returning error (non-zero status):', result.stdout || result.stderr);
      return new Response(result.stdout || result.stderr, {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(result.stdout, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.log('Catch block error:', String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 