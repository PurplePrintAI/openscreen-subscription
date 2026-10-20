# Imported video: transcription, preview and visual-agent gaps

Scope: isolate the reported failures without changing the installed app, the
original project/media, or another workstream. No Computer Use, external model
call, download, merge or release. Worktree: `fix/studio-whisper-unicode-path`.

## Windows transcription startup

The installed helper failed with `3221226505` (`0xC0000409`) during model loading.
The model's SHA-256 matches the pinned `STT_MODELS` digest. A copied complete
native payload reproduced the failure with the original Korean profile path:

| Model argument | CPU | Vulkan |
| --- | --- | --- |
| Full Korean profile path | Same startup crash | Original app report |
| Same model in an ASCII directory | Ready | Ready |
| Original directory as `cwd`, ASCII model filename in argv | Ready | Ready |

The helper uses narrow `main(argc, argv)` while whisper.cpp expects UTF-8 paths.
The Windows launcher now uses the model directory as `cwd` (carried through
Windows's Unicode process API), passes the shipped ASCII model basename, and
resolves the executable absolutely before changing `cwd`. The model is neither
moved nor redownloaded. This is scoped to the shipped fixed ASCII model filename;
it does not claim arbitrary Unicode model-filename support in the native helper.
Other platforms keep their existing full-path argument.

The Windows regression failed before the change; the STT dependency tests passed
afterward (79 tests). App/test TypeScript checks passed; changed-file Biome passed.
The modified real manager then transcribed the first eight seconds of the supplied
video through Vulkan with the original Korean model directory. This verifies
startup and inference, not transcript accuracy. Only counts/language/backend were
recorded, not the transcript contents.

## D3D11 preview after an AI speed edit

The supplied file is ordinary H.264 Main / yuv420p, 1920x1080, 30 fps, about
35.933 seconds, with AAC audio. Its isolated ordinary seeks and playback worked.
The owner clarified that the failure followed an AI-applied 1.25x speed change.

A narrower native sequence reproduces the exact error with the installed payload
and a read-only scene serialization of the affected project:

1. Seek to the final video frame, 35.9 s.
2. Seek to the duration boundary, 35.933333 s (past the final frame).
3. Seek back to 35.9 s.

Step 3 throws `frame sans texture D3D11`; later seeks also fail because the render
thread has exited. `avcodec_receive_frame` clears its output on EOF, but
`Decoder::next` retained `cur_pts`. Consequently `seek_to`'s same-frame shortcut
returned a cleared AVFrame as though its GPU texture were still valid.

The fix invalidates `cur_pts` before decoding into the current frame. Successful
decoding sets it again as before. A focused decoder test in the existing Windows
pipeline test module failed before the fix (`EOF retained a stale seek-cache
timestamp`). It uses existing generated media through `OPENSCREEN_TEST_MEDIA`;
without that environment variable it explicitly skips, so CI success alone does
not establish GPU coverage.

The focused test passed after the fix (one executed, 137 unrelated tests filtered
out). A freshly rebuilt native addon was staged into a separate copy of the
complete runtime payload, using the same pinned FFmpeg SDK. The exact supplied
video/scene probe then passed: `35.9 → 35.933333 → 35.9 → 0` returned valid frames
again, and playback through the end plus a subsequent active-clip update did not
kill the render thread. Before/after binaries and logs are retained separately.
This is offscreen native rendering evidence, not a physical app/UI smoke test.

## Visual-agent capability gap

The current editor agent exposes document/transcript/cursor reads and timeline
mutation tools. It does not expose a video-frame inspection tool. The Claude
editor MCP adapter returns text content; its CLI's general-purpose tools are
deliberately disabled. Image generation is a separate feature, not video viewing.
Fixing transcription or preview cannot make the agent understand screen contents.

The next feature slice should connect:

1. A bounded local frame extractor addressed by approved project `assetId` and
   source timestamp, independent of the live preview renderer.
2. Actual image content through each supported provider adapter, with explicit
   disclosure/consent before sending frames and no arbitrary filesystem access.
3. Timestamped findings and normalized focus rectangles, with uncertainty rather
   than guessed screen coordinates.
4. Conversion from source time to the edited timeline before validated zoom,
   annotation and cut operations; preserve undo and the existing edit-consent gate.

Start with the currently used Claude path and this supplied 35.9-second clip,
then cover Codex/API transports. Do not silently enable unrestricted CLI Read,
browser or shell tools to obtain vision. This feature is **not implemented by the
two bug fixes above**, and no external visual analysis call was made.

## Evidence and verification policy

Local evidence is under
`D:/purpleprint-build/studio-whisper-startup-20261021`: before/after helper probes,
manager inference metadata, native preview probes and targeted test logs.
The owner requested dependency-focused checks rather than repeated full suites.
A full Vitest run started before that instruction was stopped; it is not a passing
test result. Subsequent checks are limited to affected dependencies and the exact
failure sequence.

Both fixes are source changes in the isolated worktree. The installed `.12` app
has **not** been replaced, and no new installer or public release has been created
for these fixes. All probe helper processes/views were closed. Next delivery gate:
package the two fixes into a candidate, verify these same dependencies in that
package, and obtain installation approval before replacing the user's app.
