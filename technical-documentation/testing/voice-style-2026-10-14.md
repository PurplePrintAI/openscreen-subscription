# Local preset voice style comparison

2026-10-14 (Asia/Seoul). The owner approved adding the approximately 4.52GB
instruction-capable model on D: and generating two short samples in isolated QA.
No Studio installation, active runtime settings, Claude worktree or existing
model was changed. No application or Computer Use session was opened.

## Model and runtime

New model directory:
`D:/purpleprint-build/voice-runtime/models/qwen-tts-custom-1.7b`.
The existing sibling 0.6B Base, 0.6B CustomVoice and whisper-small directories
were retained. OllamaModels and Noktt model folders were not modified.

Official model: `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`, pinned revision
`0c0e3051f131929182e2c023b9537f8b1c68adfe`. Downloaded 13 files / 4,520,218,951
bytes. All file sizes and hashes were recorded; both large safetensor files
matched upstream LFS SHA-256 values. Download/cache files were directed to D:.
Model notices and README were retained. No executable model repository code was
downloaded or trusted through remote-code loading.

The existing Python/CUDA runtime loaded the local checkpoint with bfloat16 and
PyTorch SDPA on an RTX 4060 Laptop 8GB. No dependency upgrade was needed. SoX and
FlashAttention warnings remained; the tested ndarray output/SDPA path completed.
Inference and local ASR ran with offline flags and network connections disabled.
These are preset Sohee samples; no private reference recording was read/uploaded.

## Samples

Both use the same speaker, script, random seed and generation settings; only the
style instruction changes. Script:

> 퍼플프린트에서 아이디어를 설계로 구체화하세요. 무엇을 먼저 해야 할지, 근거와 함께 다음 단계를 찾아갑니다.

| Sample / intended delivery | Duration | Generation | Peak allocated VRAM |
| --- | --- | --- | --- |
| A — bright, warm, clear explanation | 8.40s | 39.06s | 4.070GiB |
| B — confident, energetic product introduction | 9.44s | 51.05s | 4.092GiB |

Raw files remain 24kHz mono PCM. Separate 48kHz listening copies use two-pass
loudness normalization with a -18 LUFS target and -1.5dB true-peak ceiling.
There is no pitch shifting or tempo processing. Upsampling does not add fidelity.
Both copies contain zero clipped samples; peak amplitudes are 0.839844 / 0.824280.

Local whisper-small transcription matched B's script after whitespace and
punctuation normalization. For A it recognized `구체화하세요` as `구체 하세요`
(normalized similarity 0.9888). This may reflect pronunciation or ASR error;
listen to that word before selecting A. No sample was regenerated automatically.
ASR matching and signal checks are not approval of vocal mood or naturalness.
The owner subsequently preferred **B** and authorized that tone as the default
for new preset narration. This preference is not blanket approval of every
future generated take or custom instruction.

## Private artifacts and integration boundary

`D:/purpleprint-build/studio-voice-style-20261014` contains installation manifests,
download/inference/verification scripts and logs, raw WAVs, listening WAVs,
per-sample provenance and `sample-validation.json`.

Listening files:

- `A-bright-clear-listen.wav`
- `B-confident-product-listen.wav`

These samples used a separate QA script that passes `instruct` to the model.
The later `feat/studio-narration-tone` worktree adds capability checks, saved tone
provenance, A/B choices and extra direction, with audition before application.
See [integration QA](narration-tone-2026-10-14.md). The installed app/runtime still
remains unchanged. Cloned-voice style control is not verified by these preset tests.

All owned download/generation/verification processes exited. No public upload,
release, cloud TTS or extra voice sample was produced.
