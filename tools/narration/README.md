# Local Korean narration proof

Status: **development integration, not a released installer**. Studio's Narration
menu runs this separate local worker. The currently installed release is unchanged.

Two explicit modes are kept separate:

- `preset`: Korean `Sohee` voice. Never reads a personal recording.
- `clone`: a local WAV/FLAC and its transcript, with explicit speaker permission.
  The recording stays local; no account token or subscription is used.

## Verified runtime

Windows, Python 3.12.13, NVIDIA RTX 4060 Laptop 8 GB, PyTorch 2.11.0+cu128,
torchaudio 2.11.0+cu128, qwen-tts 0.1.1, transformers 4.57.3. Attention is PyTorch
SDPA; FlashAttention is not required for this proof. CPU-only and Mac execution
are **not verified**. Optional SoX absence printed a warning but did not prevent
the tested array-input inference paths.

Install dependencies and download models separately after showing the user the
disk/network requirements. Generation must never silently install them.

| Mode | Official checkpoint | Tested revision |
| --- | --- | --- |
| clone | Qwen/Qwen3-TTS-12Hz-0.6B-Base | `5d83992436eae1d760afd27aff78a71d676296fc` |
| preset | Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice | `85e237c12c027371202489a0ec509ded67b5e4b5` |

An isolated preset-style QA also tested **1.7B CustomVoice** at revision
`0c0e3051f131929182e2c023b9537f8b1c68adfe`, installed beside these models on D:.
It supports instruction control; the 0.6B preset does not. The owner selected B
from that comparison. The tone development worktree now exposes B/A/neutral plus
extra delivery direction; configured `presetModel` must point to 1.7B CustomVoice
for styles. It never silently downloads or changes the installed app's runtime.
See [voice-style QA](../../technical-documentation/testing/voice-style-2026-10-14.md)
and [tone integration QA](../../technical-documentation/testing/narration-tone-2026-10-14.md).

Download each complete snapshot, including `speech_tokenizer/`. Model cards mark
the weights Apache-2.0; preserve model notices if redistributing. See the
[official model and Python API documentation](https://github.com/QwenLM/Qwen3-TTS).

`local-runtime.json` (ignored) specifies local model folders:

```json
{
  "pythonPath": "D:/voice-runtime/venv/Scripts/python.exe",
  "cloneModel": "D:/models/qwen-tts-base-0.6b",
  "presetModel": "D:/models/qwen-tts-custom-0.6b",
  "whisperModel": "D:/models/faster-whisper-small"
}
```

Keep job files and outputs outside the repository. A preset job:

```json
{"mode":"preset","text":"퍼플프린트에서 아이디어를 설계로 구체화하세요."}
```

A clone job:

```json
{
  "mode": "clone",
  "text": "합성할 한국어 대본입니다.",
  "speakerConsent": true,
  "referenceAudio": "D:/private-voice/reference.wav",
  "referenceText": "이 녹음에 실제로 발화된 말입니다."
}
```

`speakerConsent` records permission that the app has actually collected; it is
not a substitute for asking the speaker. Choose 3–30 seconds of one speaker,
without music or other voices. Preserve the original. Never commit recordings,
speaker embeddings, reference transcripts, or private model prompts.

```powershell
python tools/narration/generate.py --runtime tools/narration/local-runtime.json --job D:/private-voice/job.json --output D:/private-voice/output-v1.wav
python -m unittest discover -s tools/narration -p 'test_*.py' -v
```

Inference requires already downloaded local models and disables network connect
calls in its process. Outputs use new filenames; existing WAV/JSON files are not
overwritten. WAV and a provenance JSON are produced. Normalize playback loudness
and preview before accepting a take. ASR is useful for script checks, but cannot
approve naturalness, speaker similarity, consent, or commercial suitability.

## Studio integration

Set `STUDIO_NARRATION_RUNTIME` to the absolute runtime JSON for development, or
place `narration-runtime.json` in the app's userData folder. Neither executable
paths nor model paths are accepted from renderer IPC. Workers are launched
without a shell or ambient AI credentials. Closing the owning window or cancelling
stops the owned process tree. Python/model installation remains a manual preflight.

Studio menu → **나레이션 / Narration** → Korean preset or authorized reference →
script (up to 600 characters) → preset tone/direction → generate → preview → apply.
Cloning does not use A/B tone control. Tone or script changes require regenerating
and auditioning; existing WAVs are preserved. Reference selection
accepts 3–30-second local WAV/M4A/MP3/FLAC recordings, converts a bounded local WAV
and transcribes using faster-whisper. Review the transcript before cloning.

Each take lives in userData/narration with its WAV and script/provenance. Applying
stores one project-level layer in `legacyEditor.narration`: source file, voice
mode, script, output-time offset and original-audio gain. It can be replaced or
detached, survives schema-v7 serialization and uses the normal undo-aware save.
Detaching does not delete originals or prior takes.

Editor playback maps raw/trimmed/sped-up clip time to output seconds. Narration
plays at normal speed; original audio is kept, lowered to 40%, or muted. GUI MP4
export uses `src/lib/exporter/voiceoverMix.ts`, copying encoded video packets while
mixing audio. GIF remains silent. Voice past the video end is cut. The current
renderer mix is limited to 512 MiB exported video; larger exports need a future
streaming mix. Narration is a whole-project layer, not a draggable multi-clip
audio timeline. After changing video edits, review narration alignment again.

CLI export's existing `--audio`, `--audio-mode`, `--audio-offset` remain separate;
CLI does not automatically consume this new project layer. Portable project
packing does not yet collect the narration WAV, so keep the local take folder
available. Runtime installer UX, reference deletion UI and Mac validation remain
outside this development slice. Manual desktop verification is recorded separately.
