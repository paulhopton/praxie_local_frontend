# local_transcribe_diarization.py
import sys
import json
from faster_whisper import WhisperModel
try:
    from pyannote.audio import Pipeline
    HAVE_PYANNOTE = True
except ImportError:
    HAVE_PYANNOTE = False

MODEL_SIZE = "small"

# Helper to format output
def output(segments):
    print(json.dumps({"segments": segments}))

# Main logic
def main(audio_path, language=None):
    model = WhisperModel(MODEL_SIZE, device="auto", compute_type="auto")
    segments, info = model.transcribe(audio_path, beam_size=5, language=language)
    whisper_segments = list(segments)
    if not HAVE_PYANNOTE:
        # No diarization, just return all as speaker 1
        out = [{
            "speaker": 1,
            "start": float(seg.start),
            "end": float(seg.end),
            "text": seg.text.strip()
        } for seg in whisper_segments if getattr(seg, 'no_speech_prob', 0) < 0.5]
        output(out)
        return
    # Diarization with pyannote
    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization@2.1", use_auth_token=None)
    diarization = pipeline(audio_path)
    # Assign speakers to segments
    out = []
    for seg in whisper_segments:
        if getattr(seg, 'no_speech_prob', 0) >= 0.5:
            continue
        # Find overlapping speaker
        speaker = None
        for turn in diarization.itertracks(yield_label=True):
            (start, end), _, label = turn
            if seg.start < end and seg.end > start:
                speaker = int(label.replace('SPEAKER_', '')) if label.startswith('SPEAKER_') else label
                break
        out.append({
            "speaker": speaker if speaker is not None else 1,
            "start": float(seg.start),
            "end": float(seg.end),
            "text": seg.text.strip()
        })
    output(out)
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