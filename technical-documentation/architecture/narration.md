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

GUI MP4 export mixes the rendered video with the saved narration using the existing
voiceover mixer and checks the final write before reporting success. The video
stream is copied; audio is encoded. The new layer is not automatically used by
the old CLI export or portable pack commands. GIF is silent, and narration beyond
the output duration is cut. The first integration accepts short scripts and a
512-MiB output-video ceiling; full streaming mix and a multi-track audio timeline
are separate work.

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
