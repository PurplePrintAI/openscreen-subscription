# Local narration

The development editor exposes one Korean narration layer per project, generated
by a separately installed Qwen3-TTS runtime. It is not part of the installed
release until packaged and promoted. [Runtime contract](../../tools/narration/README.md).

## Boundaries

`src/lib/narration.ts` validates IPC and the `legacyEditor.narration` envelope.
The renderer sends a bounded script, project id and either preset mode or an
opaque reference id plus explicit speaker permission and confirmed transcript.
The native file chooser is the only way to register a reference. Renderer requests
cannot choose Python/model executables or arbitrary input/output paths.

`electron/narration` owns per-window status and worker cancellation. It converts
local recordings with FFmpeg's file/pipe protocol allowlist and caps processing at
31 seconds (3–30 seconds are accepted). It transcribes locally, then generates
using pinned local models, normalizes the result and fully decodes it before
returning an applicable take. Script/recording upload and automatic model download
are not implemented. The worker environment excludes ambient AI credentials.
It preserves the local Windows user name (falling back to `os.userInfo`) because
PyTorch cache initialization calls Python `getpass.getuser`, whose `pwd` fallback
is unavailable on Windows when all user-name variables have been stripped.

## Project and playback

### Preset tone and user direction

New preset requests default to **B · Confident product introduction**. The other
choices are **A · Bright and clear** and **Original tone** (no style instruction).
An optional 400-character delivery direction is combined with the selected
preset; it is distinct from the spoken script. Instructions express qualitative
pace, emotion and emphasis, not guaranteed numerical speed/pitch values.

The main process reads the configured local model's type/size. Only verified
`custom_voice` / `1b7` capability enables instruction control. Unsupported or
unknown models reject styled jobs before inference; the neutral option without
extra direction remains available. Python repeats this check and rejects style
instructions for clone jobs. No model download or runtime switch occurs in IPC.
The worker echoes its applied instruction; a mismatch or old worker response
prevents an applicable take from being returned.

Generated takes optionally store `tone: { preset, direction? }` and `model`.
Apply/save/undo retain this provenance. Legacy audio without a tone is displayed
as unknown/original, not relabeled B. Reopening restores the saved selection.
Changing the script, tone or direction pauses audition and revokes its approval.
Apply requires the matching take's actual `playing` event, not a play request;
audio errors revoke it too. This is playback-start gating, not evidence that a
human listened to every word. Cloning follows the reference recording and does
not expose unsupported A/B tone controls.

Apply/removal go through the existing undo-aware document save. The optional
envelope preserves compatibility with schema-v7 passthrough editor settings.
Audio files remain local external assets. Keeping old takes makes undo and
replacement reversible; detaching a layer is not erasing the voice recording.

`narration-clock.ts` integrates the same visible clip and projected speed ranges
used by the native scene into output-time spans. `NarrationPlayback` follows that
clock on play, pause and seek. Source audio gain is multiplied independently of
the editor's existing audio gain so removing narration restores that setting.

GUI MP4 export uses the bundled FFmpeg in the main process; it does not require
renderer WebCodecs/`AudioEncoder` or load the full video into browser memory.
The native Save dialog grants a one-use output path to that renderer window.
The mixer accepts only that path and the exact narration layer loaded from the
saved project. It rejects changed layers, source-recording destinations and
non-regular files. IPC checks the trusted main frame, serializes each window's
export and cancels owned mixing when the window closes or the app quits.

Native compositor MP4s contain an AAC bed even when source clips are silent.
FFmpeg applies the saved original gain and voice offset, pads the voice and ends
the mix with that bed. Video packets are copied; audio is encoded to AAC. It
writes a unique sibling temporary file, fully decodes it, rechecks the saved layer
and output identity, then atomically replaces the selected export. Failure or
cancellation before promotion preserves the original export and removes only
the owned temporary file. There is no renderer 512-MiB memory ceiling on this path;
child-process timeouts still bound work.

The saved layer is not automatically used by the old CLI export or portable pack
commands. The legacy CLI `--audio` WebCodecs mixer is unchanged and is not covered
by this Studio GUI verification. GIF remains silent; narration beyond the video
duration is cut. A multi-track audio timeline is separate work.

## Verification

Tests cover schema round trips, project boundaries, preset/clone separation,
consent, output-time mapping across trims and speed changes, worker locking,
cancellation, preview-before-apply, stale-script invalidation, and failed exports.
An opt-in `scripts/validate-narration.ts` exercises real local models and FFmpeg in
a separate QA directory. It requires an explicitly authorized reference recording.
The [Windows GUI verification record](../testing/narration-2026-10-11.md) covers
both modes through preview, apply, full restart and final MP4 validation. It also
records an unresolved intermittent native export crash; successful retries are
not a release stability sign-off. Component/worker tests alone do not establish
desktop or native correctness.

`scripts/validate-narration-tone.ts` exercises the real preset service/worker with
an isolated 1.7B configuration and no private reference. Tone integration results
are recorded in [tone QA](../testing/narration-tone-2026-10-14.md).
