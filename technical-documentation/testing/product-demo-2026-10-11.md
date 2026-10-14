# Product demo production — 2026-10-11 validation

Branch: `feat/product-demo-production`, based on fork main `e787ad6c`.
Local experimental implementation; no installer replacement, push, PR, tag or release in this task.

## Results

- App and test TypeScript checks: pass.
- Final full unit suite: **195 files passed; 2,297 tests passed; 5 skipped**.
- Changed-file Biome check, `git diff --check`, `npm run docs:check`: pass.
- Final `npm run build-vite`: exit 0. Existing chunk-size/dynamic-import warnings remain.
- Automated Electron UI check on a separate QA app/profile: production menu and dialog visible, trusted IPC status succeeds, saved PurplePrint project opens with **12 distinct timeline clips**, no renderer page errors. This is not a physical-input manual smoke test.
- Full installed native directory copied only into the QA app: **19 files**, all SHA-256 values match the installed `.12` native bundle. No native source modification or native rebuild is claimed.
- Live Claude local planner, using the configured `opus[1m]` runtime and public page evidence, produced a shot plan. No authentication files or user Chrome cookies were copied. Capture used an ephemeral app-owned browser on `https://purpleprint-ai.com/`.
- Successful pilot: **12 takes**, planned **130 seconds**, new schema-v7 editable document, 12 clip-anchored caption overlays, no audio/transcription calls.
- Existing Studio native CLI exporter rendered a **1280×720 H.264 MP4**, **129.966 seconds**, approximately **9.39 MB**, 60 fps export with silent AAC. Sources are browser samples at up to 12 fps encoded at 30 fps; the export frame rate does not increase captured motion detail.
- MP4 full decode: exit 0. Midpoint and report-view frame checks confirm captions remain inside the frame and public demo/report examples are labelled.

## Issues caught and fixed

1. The standalone Electron ESM test entry waited for app readiness at top level; the harness now starts from `app.whenReady().then(...)` without blocking entry evaluation.
2. Tab changes invalidated absolute DOM element indexes. Targets now resolve by role/type, observed text and same-label occurrence. Nested report/article/tab-panel headings are not offered as durable page targets; a missing target fails explicitly.
3. Centre-aligned scroll framing cut off product panels. Scroll margin and start alignment leave the panel visible below the fixed navigation.
4. Annotation coordinates were incorrectly treated as a centre. They are top-left coordinates; caption boxes now stay within the screen rectangle. Font size was adjusted and the project/MP4 regenerated without further model calls or recapture.
5. The source encoder could lose one final frame to concat timebase rounding. A short cloned tail plus an explicit output frame count fixes future captures. A real encoder regression check yields exactly **120 frames / 4.000 seconds**. The pilot's 129.966-second media remains labelled with its measured duration above.
6. The undo-write audit correctly rejected an undeclared pre-navigation save. Its existing automatic-checkpoint table now declares that save; it does not add an undo step.

## Artifacts (local, not committed)

- Delivery: `D:/purpleprint-build/product-demo-20261011/deliverables/`
- Primary video: `PurplePrint-product-intro.mp4`
- Editable project: `PurplePrint-product-intro.openscreen`, with `take-01.mp4` through `take-12.mp4` beside it.
- Native export evidence: `native-export-v2.log`; final build/unit logs: `build-final.log`, `unit-suite-final.log` in the parent output folder.
- Automated UI evidence: `ui-final-proof/production-dialog.png`, `draft-editor.png`, `ui-result.json`.
- Video SHA-256: `B79218A3076E16B45ECE1233AD371C309DFFE71B540E28DFB77AA51B6F6842EB`
- Project SHA-256: `672668E435FE1C229776F865C986DC8AD26355F4873D955971015DE41AC194D3`

## Limitations

This validates a public, single-page product walkthrough, not an authenticated live coaching session. Login/form actions, arbitrary app operations, multi-page exploration, voiceover and chat-intent routing remain unimplemented. The successful film is an editable silent draft, not a finished narrated marketing film.

Local tooling was Node **22.18.0** / npm **10.9.3**, not the repository's pinned Node 22.22.1 / npm 10.9.4. A clean pinned-toolchain CI build, packaged Windows manual QA and macOS validation are still required before a release. The existing installed Studio and its profile were not modified. The QA product browser and app processes were closed after validation.

## Later follow-up: editable scene framing and the 18-second product pilot

This follow-up used the pinned Node 22.22.1 / npm 10.9.4 toolchain. It does not
retroactively change the initial landing-page pilot or its validation limits.

### Feature and automated checks

The optional shot-plan framing fields expose interval/scale review without
another model request. Coordinates cannot be supplied by the model. The recorder
measures a known heading or associated tab panel three times before zoom lead-in;
unstable, missing, clipped or overlarge targets retain the full view with a
warning. The document builder emits standard clip-anchored zoom regions. Tests
cover validation, observation stability/timing, native scene scale, skipped focus,
DOM panel geometry without clicks, and UI review of valid/invalid zoom intervals.

- Focused product-demo tests: 27 passed.
- Full suite before the subsequently discovered preset-control fix: 201 files,
  2,329 passed and 5 skipped.
- After the preset fix: 60 tests passed across existing timeline and document
  write-audit suites, including custom-scale replacement, undo and redo.
- Both app/test TypeScript configs and final Vite build passed. The full suite
  was not redundantly rerun after the narrow preset fix.
- `scripts/validate-demo-framing.ts` exercised the real Chromium observation and
  capture path on a labelled local diagnostic fixture. It used a deterministic
  planner, not a model call or a native-input GUI test. The visible-window run
  emitted a 1.25x clip-anchored region at 3–6 seconds without a warning.
- Initial diagnostic attempts were not passes: the system FFmpeg lacked
  `libopenh264`; a hidden-window retry returned `UnknownVizError`. The successful
  run used the complete bundled `ffmpeg-shared.exe` directory and a visible
  dedicated fixture window, which closed after recording.

### Actual native-input Studio validation

The original 18-second, two-cut real PurplePrint recording was reused, with the
document pane already wide. No new product interaction, generated product UI,
Claude workspace change, or demo-data mutation is claimed. This directed pilot's
focus rectangles were manually reviewed against the existing video; it is not a
claim that the recording was re-shot by the new automatic observer.

The common framing builder authored two editable 1.25x zooms: recommendation and
decision cards (region 3–8 s), then the document panel (10.5–15.4 s), with Studio's
existing easing before/after the region boundaries. The previously authorized
local founder-voice sample was reused at +1 s, duration 13.44 s. No new voice/model
call or external upload was needed. The original UI typography/colours remain;
no eyebrow, decorative counter or synthetic interface was added.

Actual Computer Use in the isolated QA app verified:

1. Both normal zoom-track regions and their manual-focus inspector were present.
2. Changing 1.25x to 1.5x initially exposed an existing bug: `depth` changed while
   `customScale` still overrode it. The fix clears the override when a preset is
   chosen and displays the effective custom value. Rebuilt GUI verification
   confirmed the 1.50x pill and persisted depth 2 without a custom override.
3. Ctrl+Z restored 1.25x and its saved override. Seeking to 5 s and 12 s showed the
   intended card/document framing. Full playback advanced to 18 s.
4. The GUI MP4 exporter completed at 1080p / H.264 / 30 fps with narration.
5. Full app quit/relaunch restored both 1.25x regions. The project SHA-256 matched
   the post-edit saved snapshot across restart.

All 19 native bundle files matched the installed .12 bundle by SHA-256. The
installed app/profile were not changed. The successful export used Intel QSV
after unavailable AMF/NVENC options. This run had no app crash; it does not resolve
the earlier intermittent export termination recorded in the narration QA report.

### Final media and cleanup

Private build folder: `D:/purpleprint-build/zoom-pilot-20261011/`.

- `PurplePrint-guided-scene-1080p.mp4`: actual GUI output; 1920×1080, 18.005333 s,
  H.264 + AAC 48 kHz; whole-file decode passed. Decoded voice matched the reference
  at exactly 1.000 s with waveform correlation 0.9999817.
- Video SHA-256:
  `f8205bc0d38e1a6e177672caca2aa341dadf1bfec87f101c0705e1d5eac74be1`.
- `PurplePrint-guided-scene-verified.openscreen`: saved editable QA project,
  SHA-256 `c54503e3e75d73a011f62ab296098ec57be3ab743e4d5970945aa7cba4021421`.
  It references external local video/audio assets; this is not a portable bundle.
- Source/export contact sheets were inspected: opening full view, card emphasis,
  document emphasis and return are visible. Source is 2560×1440; a 1.25x crop
  retains approximately 2048×1152 before 1080p output, without needing enlargement
  beyond source pixels. This quality statement is specific to the pilot, not the
  current lower-resolution automatic capture path.

The QA app quit normally after the last restoration check. Owned QA/fixture
processes were confirmed absent and the Computer Use kernel reset immediately.
No installer, Git commit, push or release was created in this follow-up. The
full introduction, narration-to-shot automatic alignment, continuous target
tracking, new capture resolution and release stability remain separate work.
