# Windows MP4 duration — 2026-10-14

## Scope and isolation

Branch: `fix/studio-export-duration`.
Worktree: `D:/dev/openscreen-studio-export-stability`.
Evidence: `D:/purpleprint-build/studio-export-stability-20261014`.

The 111 changed/untracked files from the scene-planner worktree were copied and
SHA-256 checked before editing. Their source bytes and Git status were checked
again after export. The original footage, original project, GUI-created draft
and GUI-exported MP4 are unchanged. The installed Studio app and Claude's work
were not modified. No additional AI/voice generation was requested.

**No QA app or Computer Use session was started.** The production N-API export
function was invoked from Node without creating a view. This is native pipeline
verification, not desktop UI, installer or release validation. It does not claim
to solve the earlier Computer Use session-termination problem.

## Reproduction and cause

The existing GUI output contained 570 correctly timed video frames for a
19-second timeline. Its video-stream duration was nevertheless `18.966667`,
with average FPS `17100/569`. The container's AAC track hid the discrepancy by
keeping overall duration at 19 seconds.

An extended assertion in the existing `export_timing.rs` regression reproduced
the bug before the production fix: a 4-second, 30fps export with `h264_qsv`
contained 120 frames but reported video duration `3.966666666666667` seconds.
The failing log and MP4 are preserved as `baseline-test.log` and
`baseline-4s-30fps.mp4`.

The Windows pipeline uses a constant output rate and codec time base `1/fps`.
Its packet drain rescaled timestamps but did not supply a duration when the
encoder left that field unknown (`0`). MP4 could infer intervening samples from
adjacent timestamps, but the final sample did not extend the stream end time.

`pipeline_windows::drain_encoder` now fills only an unknown video-packet duration
with one codec tick before timestamp rescaling. This includes packets returned
during flush. Known durations, PTS/DTS, frame count, compositor pixels and the
separate AAC path are unchanged. No final-frame duplication or output remux
workaround is used. macOS/Linux implementations were not changed.

## Native tests and binary provenance

- Baseline regression: **failed as expected** on video duration.
- Fixed timing suite: **3 tests passed**: H.264 at 24/30/60fps and a one-frame
  timeline, H.265 at 30fps, existing GIF temporal coverage. Hardware selection
  on this PC used QSV; unavailable AMF/NVENC attempts appear in the logs.
- Forced `OPENSCREEN_EXPORT_ENCODER=libopenh264`: the H.264 multi-rate and
  one-frame assertions passed through the software encoder as well. This used
  a hardware compositor with software encoding; it is not a WARP test.
- Native library unit tests: **137 passed**.
- Production `compositor-view-napi` release build: passed using existing MSVC,
  local libclang and the pinned FFmpeg SDK. Cargo used `--locked --offline`.
  Existing Rust/FFI warnings remain; they were not suppressed.

The prior QA native directory was copied in full (19 files), then all seven
DLLs from the SDK used for compilation were staged and hash checked. The freshly
built addon replaced the copied addon only inside the new evidence directory.
`native-runtime-manifest.json` records each file and its provenance.

Rebuilt `compositor_view.node` SHA-256:
`735e72cbdff68929702f5b11bcd4346b97ba8d89be2f63c20dc2a630487ddafc`.

## Existing 19-second draft, rebuilt native export

Input was the unchanged GUI-created project
`proj_d4c8185c-404d-4752-9dc2-46b4c41797db.openscreen` from the earlier planner QA.
The real `buildSceneDescription` serialized its three clips and captions.
The rebuilt addon then executed `exportMulti` at 1920×1080/H.264. It did not
re-plan, regenerate assets, rewrite the project, open a view or run Electron IPC.

| Output | Video duration | Container duration | Average FPS | Decoded frames |
| --- | ---: | ---: | --- | ---: |
| Previous actual GUI MP4 | 18.966667 s | 19.000000 s | 17100/569 | 570 |
| Fixed native, 30fps | 19.000000 s | 19.000000 s | 30/1 | 570 |
| Fixed native, 60fps | 19.000000 s | 19.000000 s | 60/1 | 1,140 |

Both new files fully decoded without error. Every presentation timestamp follows
the requested CFR, and the last frame ends at 19 seconds. Silent source audio
remains silent (decoded PCM peak 0). **All 570 decoded picture hashes of the
30fps output match the previous actual GUI MP4**, including its captions and cut
boundaries. The 60fps output has no previous 60fps GUI reference for pixel matching.

Artifacts in the evidence directory:

- `ai-plan-19s-1080p-30fps-fixed.mp4` — SHA-256
  `07513d78d290f786246d63f34a8429cace588ac360cd32798b9c3dcea5829509`.
- `ai-plan-19s-1080p-60fps-fixed.mp4` — SHA-256
  `b02ce14e1311bf6fc1e926095025872e6dd703ca52a8fe2f78d5f3995822fc80`.
- `export-request.json`, `native-export-results.json`, `export-verification.json`
  and the local preparation/export/verification scripts record the exact inputs
  and checks. The previous GUI MP4 was not repaired or overwritten.

## Application regression and remaining gates

- Full Vitest suite: **211 files, 2,389 passed, 5 skipped**, one full run.
- Application and test TypeScript checks: both passed.
- Vite renderer/main-process production build, documentation links, i18n checks
  and `git diff --check`: passed. No installer was produced.
- Native source change is limited to Windows video packet drain; no application
  feature code was changed in this stabilization step.
- Installed-app replacement, public push/PR/release, automatic updates, new-PC
  runtime setup and Mac tests were not performed.
- A real isolated-app export pass is still required before release. Computer Use
  remains on hold until its actual session ending can be verified or the user
  explicitly accepts that limitation.

Feature ownership and subsequent integration review are documented in the
[integration review plan](../../docs/studio-integration-review-plan.md).
