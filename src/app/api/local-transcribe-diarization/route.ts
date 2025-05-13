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
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-stt-dia-'));
    const tempFile = path.join(tempDir, 'audio.wav');
    await fs.writeFile(tempFile, Buffer.from(arrayBuffer));

    const pythonPath = 'python3';
    const scriptPath = path.resolve(process.cwd(), 'local_transcribe_diarization.py');
    const result = spawnSync(pythonPath, [scriptPath, tempFile, language], { encoding: 'utf-8' });

    await fs.unlink(tempFile);
    await fs.rmdir(tempDir);

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (result.status !== 0) {
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
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 