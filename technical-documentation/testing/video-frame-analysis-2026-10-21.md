# Video-frame editing — isolated verification, 2026-10-21

## Delivery boundaries

The installed application and the owner's original project/media were not changed.
No Computer Use, merge, release or additional download was performed. The bugfix
worktree and feature worktree are separate:

- `D:/dev/openscreen-studio-whisper-unicode` — committed transcription/EOF fixes.
- `D:/dev/openscreen-studio-video-frames` — visual-agent capability on those fixes.

The existing installed app does not acquire these features merely because this
work passed. The packaged `.13.qa.2` QA app contains the **two bug fixes only**.
The subsequent `.13.qa.3` unpacked Windows QA package includes visual-agent code
and passed the integrated checks below. Neither package is an installed upgrade
or a published release; no new installer was produced.

## Bugfix package QA

Built an unpacked, unsigned Windows package with the normal packaging guard,
cached dependencies and `--publish never`; ASAR version is
`1.10.0-subscription.13.qa.2`. The first attempt failed because an early Sandbox
folder mapping locked the executable rename. That guest was stopped and the
successful package was completed before it was mapped into a new guest.

The isolated guest had networking/clipboard/microphone/camera sharing disabled.
The owner-approved `CurrentUser RemoteSigned` policy was applied only inside the
disposable guest. App profile was `C:/QA-한글/profile`, with a copied, already
verified speech model. No model was downloaded.

Checks used the packaged renderer/preload/main IPC, not a replacement manager:

- Eight seconds of the supplied video audio transcribed on `whispercpp-vulkan`
  through `window.electronAPI.stt.transcribe`, with the Korean profile path.
- The native compositor returned frames across
  `0 → 35.9 → 35.933333 → 35.9 → 0` with the 1.25x scene.
- The first probe lost its execution context during initial app navigation; the
  retry waited for the actual HUD before checking. The failed probe was retained.
- QA app, guest and owned connection client were closed; `wsb list --raw` was empty.

This verifies the changed import dependencies, not a new full recording/export
pass or an in-app automatic update.

## Visual-agent implementation

`inspectVideoFrames` accepts an asset ID and one to four source timestamps. The
model cannot supply file paths. The tool reads its current document snapshot,
enforces an eight-frame turn budget, rejects invalid/out-of-duration requests,
and avoids seeking beyond the final frame.

The injected reader checks the existing media allow-list both before and after
canonicalizing the path. It asks for explicit disclosure consent before extraction;
declines are remembered for the asset during that turn. FFmpeg uses local file/pipe
protocols, no shell, bounded 1280-pixel JPEGs, a 2 MiB output limit and a timeout.
No screenshot directory or arbitrary CLI file/shell tool is exposed to the model.

Images remain typed image content:

- Claude: MCP `image` blocks with MIME type and base64 bytes.
- Codex: `inputImage`/`imageUrl`, confirmed against the locally installed CLI's
  generated `DynamicToolCallOutputContentItem` schema. The protocol context is
  documented in [Codex App Server](https://learn.chatgpt.com/docs/app-server).
- Anthropic API: image-bearing `ToolMessage` blocks serialized into base64 MCP-like
  tool-result image blocks. OpenAI Responses configurations: provider-native
  `input_text`/`input_image` blocks preserved as function-call output arrays.
  Tests invoke the installed SDK converters: generic `image_url` tool content
  would otherwise become a JSON string in the OpenAI Responses converter.
  Unverified API transports are not offered this tool. A model must itself
  support image input.

Frame metadata labels source timestamps and raw editing-ruler positions, including
duplicate-asset clip occurrences, trims and crop regions. Speed does not shorten
this raw ruler. Zoom focus is crop-relative, so the prompt gives the coordinate
conversion and forbids silently clamping a target outside the crop. Existing
mutation validation, edit consent and per-message rewind are unchanged.

The native consent dialog has Korean/English text. Other supported locales
currently receive English text for this new dialog; key parity was verified.

## Focused checks

No full test suite was run for this feature. Changed dependencies were checked:

- Final focused run: 99 tests across six files passed (frame tool/reader,
  agent service, chat tool loop, Claude MCP and Codex app-server).
- Frame schema, turn budget, EOF bound, timestamp/crop metadata and no mutation.
- File/canonical-path authorization, consent approval/decline and no decode on denial.
- Claude MCP image payload and Codex dynamic image response.
- Actual Anthropic/OpenAI Responses SDK serialization, plus unsupported-transport gating.
- Chat-to-agent frame-reader propagation and unchanged edit-consent gate.
- Existing Claude CLI/chat tool-loop dependencies.
- App/test TypeScript checks, changed-file Biome, locale-key check, production Vite build.
- Missing-media errors are sanitized before returning to the model.

Final installed executable and `resources/app.asar` SHA-256 values matched the
preflight preservation baseline. The final Sandbox list was empty and no owned
QA application/decoder/Claude process remained.

## One approved real-model call

The owner authorized at most eight frames and one Claude inference. The runtime
catalog confirmed Opus 5.5 (`claude-opus-5-5`). Model-catalog initialization did not
send a user prompt. An exclusive local marker prevented accidental inference retries.

The real editing service, file reader, bundled FFmpeg and Claude MCP transport
inspected eight frames from the supplied 35.9-second video. The only test adapter
supplied private Electron app paths/lifetime callbacks; the model was not mocked.
The owner's explicit approval stood in for clicking the native consent dialog.

Observed result:

- Correctly described the embedded browser, URL submission and collection-results table.
- Read frames in two groups of four, then invoked `addZooms` successfully.
- Added two depth-4 / 2.2x zooms with different vertical focus positions.
- Preserved the 1.25x speed regions and original clip list.
- Wrote only a QA result document. The original project's SHA-256 was unchanged.
- Rendered two frames from the result through the fixed native compositor: the URL
  entry/confirmation region and the results table were the visible focal regions.

The model's prose initially overstated exactly which neighboring sidebar would
be excluded; the rendered result still showed a sidebar edge. The prompt was
subsequently tightened not to promise precise composed crop bounds from source
images alone. No second paid call was made. This is a draft-edit capability, not
proof of continuous motion tracking, exact scene boundaries or final composition
quality. It sees sampled images, not the whole video stream.

Real provider execution was verified for Claude only. Codex/API image transports
were checked at their dependency/protocol boundaries, not with billed model calls.
The native consent dialog was not driven with Computer Use.

## Integrated Windows package — `.13.qa.3`

Source: `90df8520`, with the same Rust fixes as `.13.qa.2`. The normal native
freshness guard rejected a copied addon after the worktree checkout; the addon
was rebuilt offline using the existing SDK/cache, without disabling that guard.
An initial package also emitted unresolved dependency-path warnings with a
junction-backed `node_modules`. It was not used for QA. A clean packaging staging
directory from `git archive HEAD`, physical local dependencies and the verified
compiled files produced the final `package-ready` directory without those warnings.
No dependency/model download was required.

The final unsigned unpacked package was built with `--publish never`. Its ASAR
version is `1.10.0-subscription.13.qa.3`. All 14 compiled Electron files match the
staged production build, and all 19 native files match the freshly staged payload.

The owner separately approved one additional inference. A new Korean-path profile
and a copy of the supplied video/project were used. The installed EXE/ASAR and
original project hashes remained unchanged. The packaged app ran with its existing
`HEADLESS=true` option: no visible window or Computer Use was required.

The test used the packaged renderer's preload/native-bridge IPC:

- Opened the separate QA project to authorize only its copied media.
- Used the actual Opus 5.5 Claude CLI runtime and loopback MCP tools for **one turn**.
- Read exactly four source frames at 5, 15, 25 and 33 seconds with the **packaged**
  `ffmpeg-shared.exe`, confirmed by spawn tracing. The app's FFmpeg override and
  `NODE_PATH` variables were unset; a host decoder was not used.
- Observed one production disclosure-dialog request, including the default/cancel
  denial settings. Only the native click was substituted with the owner's approved
  response by an external QA adapter; the extractor, model, MCP and editor were real.
- Returned one 2.2x zoom spanning raw timeline 4–30 seconds, focused at `(0.68, 0.60)`.
  The saved draft preserved the 1.25x speed regions and clip list.
- Saved through the packaged project IPC, restarted the QA app without another model
  call, and restored both messages and the same saved edits.
- Rendered the focused region at 17 seconds and then sought through EOF to 35.9 and
  0 seconds. Hardware-backend frames arrived with generations 1, 2 and 3, distinct
  image hashes and 960×540 RGBA buffers.

Two probe assumptions were corrected without product changes or repeat inference:
the first frame needed about 1.2 seconds rather than a fixed 600 ms, and EOF may
legitimately publish no new bitmap. `readFrame` returning null means retain the
last bitmap, not necessarily a decoder failure. The regression check therefore
requires new frame generations on the **subsequent valid seeks**, not at EOF itself.
The initial failed probe evidence is retained.

This is dependency-focused package integration, not a fresh capture/export suite
or physical mouse/keyboard validation. It does not establish Mac support, a signed
installer, continuous scene tracking, or perfect zoom composition. No merge,
release or installed-app replacement was performed. All owned QA/decoder/Claude
processes and debug listeners were closed; no Sandbox was started in this stage.

Final package evidence lives outside Git at
`D:/purpleprint-build/studio-visual-package-20261021`:

- `package-ready/win-unpacked` — final QA package; do not use the earlier `package`.
- `Open-Isolated-QA.cmd` — explicit isolated-profile launcher for optional manual QA.
- `evidence/package-manifest.json`, `packaged-qa-result.json`, `cleanup.json`.
- `media/fixture.openscreen` — saved edited QA copy.
- `preview.png` — actual packaged compositor image at the zoomed section.

## Local artifacts

Evidence and media remain outside Git under
`D:/purpleprint-build/studio-visual-editor-20261021`:

- `bugfix-qa-ready/win-unpacked` — packaged bugfix QA app.
- `qa-output/bugfix-result.json` — packaged IPC checks.
- `evidence/real-vision-result.json` — approved model/tool trace, no image bytes.
- `vision-result.openscreen` — separate QA copy; never use it to overwrite the source.
- `vision-preview-10.png`, `vision-preview-28.png` — actual offscreen render checks.
- `evidence/vision-*-tests.log`, type/build/locale logs.

No source images, private project documents, provider credentials or raw model
session logs are committed to the repository.
