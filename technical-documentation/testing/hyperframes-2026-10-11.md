# HyperFrames local adapter — 2026-10-11

## Scope

Development worktree: `D:/dev/openscreen-studio-chat-persistence`, branch
`feat/product-demo-production`. This is **not a release or installed-app upgrade**.
The existing `.12` installation, real profile and Claude-owned demo/tour work were
not modified. No AI, TTS, paid-generation or cloud-render calls were made.

The requested **15–20 second real product quality pilot is pending** the demo and
tour handoff. All footage generated here is a clearly labelled runtime diagnostic,
not a replacement landing-page video or a claim of product-film quality approval.

## Runtime installed

| Component | Local version / treatment |
|---|---|
| HyperFrames | 0.8.146, isolated npm lockfile |
| GSAP | 3.14.2, copied local script with upstream license header |
| Node / npm | Portable 22.22.1 / 10.9.4; no system installation changed |
| Chrome Headless Shell | 152.0.7977.30, dedicated runtime browser |
| FFmpeg / FFprobe | Explicit external `C:/ffmpeg/bin` paths; not bundled |
| Korean font | Windows-local Malgun Gothic; no font redistribution |

`npm install --prefix tools/hyperframes --ignore-scripts --no-fund` installed
78 packages; the install-time audit reported zero vulnerabilities. No global CLI,
agent skill, MCP registration or Claude configuration was installed.

Node download matched the official release SHA-256:
`877CB93829E14FFFBBC7903E7D8037336C9A79F3EA43C5D0B8C2379B79DA56DE`.
Installed dedicated browser SHA-256:
`909FA4A0D2866F5B5B6CABD0A3B3545EDEAF84DB361148DBC8E992E25E61E7E6`.

Setup, license boundaries and repeat commands:
[tools/hyperframes/README.md](../../tools/hyperframes/README.md).

## Verified

- Real HyperFrames render: **18.0 seconds, 1920×1080, 30 fps / 540 frames**.
  Final CLI run reported about 25 seconds to render on this PC. Complete FFmpeg decode,
  poster generation and schema-v7 project persistence passed.
- Inspected the Korean diagnostic poster: characters render, and the runtime-test
  disclaimer is visible. This is technical validation, not the final visual design.
- Live lint found a missing local font declaration and nested wrapper/video timing;
  both fixed. The visual wrapper is no longer timed; the video owns its source
  timing. Final diagnostic and source-video compositions pass with **zero errors
  and zero warnings**. Added regression coverage for the non-timed wrapper.
- Full unit suite: **197 files; 2,310 passed, 5 skipped**. After the final dialog
  regression fix, reran both new feature suites: **14 passed**, including the one
  newly added repeated-render test.
- App TypeScript and test TypeScript checks passed. Vite renderer/main/preload
  build passed; existing bundle-size/dynamic-import warnings remain.
- Biome check passed for the 16 touched integration/test files. Documentation
  link checks passed.
- Automated Electron QA: diagnostic menu → actual 6-second local render → separate
  project → Studio timeline passed. Selecting that registered video asset and
  composing it into another 6-second scene also passed, with distinct project IDs
  and no renderer errors. Inspected the composed poster and confirmed the source
  content was present. The renderer screenshot checks project/timeline loading,
  not native compositor playback/export.
- The QA Electron application and dedicated Headless Shell were stopped at the
  end; a process-path check found no remaining test-app or runtime-browser process.

Artifacts are local under `D:/purpleprint-build/hyperframes-20261011`:
`smoke-03/validation.json`, render folder `fa4cd0c8-e2b0-446d-8a75-2862c1b2fced`,
`unit-tests.log`, `build-final.log`, and `ui-results-05/ui-result.json`.
The final source composition is retained in
`ui-qa/qa-profile-05/motion-scenes/6e7feec7-ccf9-4103-93d1-43f2f5de0e2f`.

This automated renderer/IPC exercise is **not** the repository's manual native
capture/export release checklist. No release promotion is requested or implied.

## Boundaries and next gate

- Renderer requests cannot provide executables, shell commands, scripts, HTML or
  arbitrary source paths. A selected recording must belong to a known project.
  Source decoding allows file/pipe protocols and rejects playlist extensions.
- Job processes receive no ambient AI keys. Telemetry, automatic updates and
  automatic installation are disabled. Stop/close cancels the owned process tree.
- A complete verified render is imported into a **new** project. Existing project
  edits are saved before navigation; a save failure leaves the generated project
  available separately. Cancellation after the completed import does not falsely
  report that the already saved project was discarded.
- MP4 graphics are flattened. HTML, text parameters, original source offset and
  copied assets remain beside the render. Revision currently creates another
  render/project; automatic replacement of one timeline clip is not implemented.
- This does not improve the original source's resolution or frame rate. The next
  real pilot must separately verify actual product capture at the intended
  resolution and motion quality.
- No arbitrary third-party HTML sandbox, narration/music, runtime distribution,
  in-app installer, macOS validation or installed `.12` update is claimed.

Next: receive the read-only demo URL and supported tour step/ready signals;
capture one approved 15–20 second product interaction and compare the rendered
scene against the product, checking readable Korean UI, timing and clear value.

## Follow-up: actual product-state pilot

Later on 2026-10-11, the user authorized checking readiness and creating the
representative cut without changing Claude's work. Read-only inspection found
the local `demo:jeonse` copy and working viewer/tour on port 8798. In a separate
Codex browser tab, verified the first recommendation and decision-card tour
steps and opened the actual UX design document. This does not certify all tour
steps or public deployment. No Claude-owned code, worker, build or demo data was
changed by this task; the existing local server was left running.

Created `D:/purpleprint-build/product-pilot-20261011/PurplePrint-18s-product-pilot.mp4`:
18 seconds, 1920×1080, 30 fps, silent. **This is a still-capture motion edit, not
live product-operation recording.** The overlay explicitly labels that distinction.
Its three beats are recommendation → user decision → design-document result.
Raw UI screenshots, SHA-256 hashes, exact crop/timing configuration, editable
HTML, an `.openscreen` project and a scene sheet are retained beside the video.
These are local artifacts, not bundled into or published with the public fork.

HyperFrames lint: zero errors/warnings. Full video decode passed. Inspected frames
at 0.8, 3.5, 8.5, 14.5 and 17.5 seconds. UI content was preserved; camera framing,
copy and transitions were authored separately. Enlarged raster text is softer
than the HTML overlay; higher-density source capture is a follow-up before final
quality approval. The brand-film scene-plan validator reports one advisory for
the intentionally absent reference video (the sources here are real screenshots).
This is not native Studio playback/export verification or an end-to-end live
capture test. Browser viewport was restored, the temporary tab closed and the
Computer Use session reset immediately after capture.

## Follow-up: actual live window recording (no decorative labels)

The user then requested actual product operation footage, sharper UI text, no
eyebrows/decorative headings and preservation of PurplePrint's current visual
language. Created a temporary isolated Electron viewer of the existing read-only
demo, with no preload/DOM injection or shared login profile. Used native Computer
Use to scroll from recommendations to the recorded decision, click UX design,
open its source document, drag the document divider and scroll the document.
Claude-owned code/data/build/server were not changed or restarted.

Studio's existing Windows Graphics Capture helper recorded **only that window**
(no desktop, microphone, webcam or system audio). Raw source: 2546×1434 H.264,
106.467 seconds. A 1.5× browser zoom rendered product text before capture; no
screenshot assets or reconstructed UI are used. The actual product's light theme,
fonts and spacing remain unchanged. No extra marketing text, eyebrow, invented
brand frame, motion interpolation or playback-speed change was added.

Output under `D:/purpleprint-build/product-live-20261011/`:

- `PurplePrint-live-18s-final-1440p.mp4`: 2560×1440 (tiny padding around the native
  pixels, not an upscaled screenshot), 18.000 seconds / 540 encoded frames.
- `PurplePrint-live-18s-final-1080p.mp4`: Lanczos downsample for delivery, same
  duration/frame count; full decode passed and six frames visually inspected.
- `PurplePrint-live-18s.openscreen`: original live recording with four editable
  source-range cuts. Idle waits are removed, so this is not a continuous 18-second
  take. The final cut ends on the widened document; the additional document scroll
  remains in the unmodified raw take.
- `take-01/raw.mp4`, capture request/stdout/stderr, timestamped input actions,
  `edit-decision-list.json`, validation metadata and SHA-256 hashes are retained.

Capture rate caveat: requested/encoded rate is 30fps. The helper logged 2,918
submissions over 106,589ms; therefore the file's 30fps header is not proof of 30
unique new source frames every second. No motion-smoothness claim is inferred
from that header. This is live manipulation of a read-only saved demo, not a new
AI conversation or a product data write. Native capture was performed; installed
Studio export/installation was not changed in this task.

The owned viewer and WGC process exited, and the Computer Use kernel was reset
immediately after recording. A later process check found neither remaining.
