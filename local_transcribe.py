# local_transcribe.py

import sys
import json
from faster_whisper import WhisperModel

# You can change the model size here: "large-v3", "medium", "small", etc.
MODEL_SIZE = "small"

def main(audio_path, language=None):
    # Load the model (will download if not present)
    model = WhisperModel(MODEL_SIZE, device="auto", compute_type="auto")
    segments, info = model.transcribe(audio_path, beam_size=5, language=language)
    # Only include segments with low no_speech_prob
    filtered = [segment.text for segment in segments if getattr(segment, 'no_speech_prob', 0) < 0.5]
    text = "".join(filtered)
    print(json.dumps({"transcription": text.strip()}))
    # For debugging, print to stderr:
    print(f"Transcribed file: {audio_path} Language: {language}", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided"}))
        sys.exit(1)
    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else None
    try:
        print(f"About to call main with: {audio_path} Language: {language}", file=sys.stderr)
        main(audio_path, language)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)