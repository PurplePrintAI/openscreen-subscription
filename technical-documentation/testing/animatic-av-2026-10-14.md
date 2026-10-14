# Animatic audio and output comparison

2026-10-14 (Asia/Seoul). Separate `feat/studio-scene-sheet` worktree; no installed
app/profile, Claude worktree, public release or source voice recording changed.
The prior work was preserved under `studio-animatic-av-20261014/baseline`
(88 files, 997,885 bytes). All media and diagnostic outputs remain outside Git.

## Audio synchronization fix

The previous audio effect could miss a paused seek made before media metadata
arrived, or start from zero while loading at a nonzero requested time. A shared
`TimelineAudio` component now waits for metadata and applies the latest target
before playing. Paused seeks are exact; playback allows 80ms clock jitter before
resynchronization. Source replacement pauses the old element; cleanup stops it.
Both narration playback and the animatic's source audio use this behavior.

Four regression tests cover pre-metadata seeks, paused one-frame seeks, the
pre-offset silent interval, replacement/cleanup, gain, clip-boundary jumps and
EOF. App and test TypeScript checks, scoped Biome and Vite build passed. Full
suite: 206 files, 2,356 tests passed, 5 skipped. Mocked HTML media pause warnings
elsewhere do not constitute real playback evidence.

## Native pixel comparison

The actual animatic driver configured a private 1920x1080 native view using the
saved three-scene 19-second project. Six captured pixel packets were compared
with decoded H.264 export frames. Cuts at 7 and 13 seconds and the final frame
were included; the end request at 19 seconds maps to frame 569.

| Output time | Export frame | Luma SSIM | RGB PSNR |
| --- | --- | --- | --- |
| 3s | 90 | 0.999015 | 41.06 dB |
| 7s | 210 | 0.996574 | 38.59 dB |
| 10s | 300 | 0.999211 | 42.08 dB |
| 13s | 390 | 0.997223 | 38.82 dB |
| 16s | 480 | 0.998828 | 40.94 dB |
| End | 569 | 0.995451 | 38.01 dB |

All passed the preselected SSIM >0.98 / PSNR >30dB check. Encoded video is lossy;
these scores do not claim byte-identical raw pixels. The new 570-frame / 19s
MP4 itself is SHA-256 identical to the previously GUI-exported reference:
`4ee138624e59ab5efb2f2f240a9a0d9af01fa4449e51b0f6e64797d121e76d8a`.
The test fixture has a solid background, no webcam or cursor telemetry; it does
not establish parity for every effect, asset resolver or GPU.

The previous standalone diagnostic failure was caused by its polling logic:
the optimized native reader consumes the frame slot, so a subsequent null is
normal until another frame arrives. Retaining the last packet while waiting for
settling fixes the diagnostic. No fake frame or product compositor fallback was
added. This is programmatic native evidence, separate from desktop interaction.

## Real Chromium audio and exported waveform checks

An isolated hidden Electron test page mounted the actual `TimelineAudio`
component and used the product's `mixVoiceoverIntoVideo` implementation. Network
requests were blocked; existing approved Korean preset (6s) and founder clone
(5.04s) WAVs were reused. No inference, upload or private reference conditioning.

After the real media engine started, 750ms wall-clock playback advanced by
0.753538s (preset) / 0.762830s (clone). A pre-load paused seek reached 2s; another
seek held at 3s; negative narration time remained paused at zero. Gain was 0.4.
The test waits for actual media playback before timing it; decoder startup
latency is not claimed to be zero.

Output audio was decoded to 48kHz and compared per channel (not ffmpeg's default
stereo-to-mono downmix, which adds sqrt(2) for identical channels):

| Test | Measured onset | Measured gain | Waveform correlation |
| --- | --- | --- | --- |
| Preset narration, expected +1s | 1.000s | 0.999273 | 0.999967 |
| Clone narration, expected +1s | 1.000s | 0.999513 | 0.999983 |
| Non-silent original bed, expected 40% | 1.000s | 0.399469 | 0.999911 |
| Clone over that bed, expected +7.5s | 7.500s | 0.999273 | 0.999982 |

All outputs fully decoded; encoded video packets were unchanged. Pre-voice
audio was zero and per-channel peak stayed below 0.844. AAC padding gives
19.008s audio (19.029333s for the deliberately twice-mixed test), while the video
remains 19s. Correlation measures timing/signal preservation, not voice identity,
naturalness or loudspeaker latency.

## Actual Studio GUI gate

Two isolated Studio fixtures put the existing voice at +5s so it crosses the
first scene cut at 7s. The owner opened the QA
shortcut and confirmed the editor was visible, but the Computer Use window and
app lists did not expose it. No input was sent to unrelated windows and the
control runtime was reset. The agent did not relaunch onto desktop 4 or repeat
desktop-move requests. The owner saved `preset-gui.mp4` and reported hearing the
female voice clearly, but also said no planning dialog was visible. Record this
as **owner-assisted editor playback/export**, not proven animatic-tab interaction
or an explicit perceptual continuity check at the 7-second cut.

The saved file fully decoded: 1920x1080 H.264, 60fps, 1,140 video frames and AAC.
Container duration is 19.008s. Voice begins at exactly 5.000s, correlation
0.999969, measured gain 0.999383, pre-voice silence zero and peak 0.841543.
SHA-256: `d30a04f5312210d9abd4eeb78881c31e580b239918e59376b28aa7d95e4051c0`.
It is a 60fps GUI export, not the 30fps reference used in the earlier pixel test.
`preset-gui.validation.json` retains measurements. The clone's new GUI export and
audible animatic-tab check remain unverified. No new installed release is approved.

## Voice quality feedback

The owner judged the default female voice too subdued/gloomy for a product
introduction. Passing waveform/timing checks does **not** approve delivery style.
The existing sample is retained as technical QA evidence, not an accepted product
narration default. Current generation fixes speaker Sohee on 0.6B CustomVoice;
the locally installed qwen-tts code explicitly ignores instruction control for
0b6. The official model table likewise marks instruction control for 1.7B
CustomVoice but not 0.6B CustomVoice:
[Qwen3-TTS model table](https://github.com/QwenLM/Qwen3-TTS#released-models-description-and-download).

The owner subsequently approved the isolated 1.7B CustomVoice download on D:.
Installation and two short style samples completed; listening approval and app
style-selector integration remain separate. Existing models and installed Studio
stay unchanged. See [voice-style QA](voice-style-2026-10-14.md).

## Private evidence and cleanup

`D:/purpleprint-build/studio-animatic-av-20261014` holds the diagnostic scripts,
pixel packets/PNGs, three mixed MP4s, `pixel-comparison.json`,
`browser-audio-report.json`, `audio-comparison.json`, and build/test logs.
The hidden native/media runners exited after their checks. No Computer Use
session was used for the programmatic tests. The later window-discovery-only
session was reset immediately. After receiving the saved GUI export, the QA app
quit via its owned lifecycle signal and no QA Electron processes remained. The
owned temporary shortcut was removed. No desktop-control session remains open.
