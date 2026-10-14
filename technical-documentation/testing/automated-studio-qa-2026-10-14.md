# Automated Studio QA — 2026-10-14

The owner delegated verification rather than being asked to operate the app.
This supersedes the **not launched** status of the earlier preparation record.
Only the isolated candidate was launched. Installed Studio, Claude workspaces and
the original footage/projects were not modified. No Computer Use session was
started and no global mouse/keyboard control was used.

Evidence root:
`D:/purpleprint-build/studio-integration-qa-20261014/automated-evidence`.

## Method and limits

Playwright Electron drove real renderer controls against the compiled candidate
and production IPC/native module. File/project inspection corroborated visible
results. The Windows Save dialog was replaced with a **one-shot QA-only selected
path** in the owned process; render, encode, native mixing, verification and write
were real. This is not a physical OS-dialog, HUD hit-testing, tray, capture,
microphone/webcam, installer, update or Mac sign-off.

The 1739×931 startup editor and a 1280×800 editor/modal pass were inspected.
Scrollable planning/narration forms and the required toolbar/transport controls
were accessible. Screenshots and full-resolution output frames were inspected.
No live AI provider request, personal voice cloning or external upload occurred.

## Real-runtime defects found and corrected

1. **Local narration import failed on Windows.** The sanitized worker environment
   omitted user-name variables. PyTorch called `getpass.getuser`, which fell through
   to importing the Unix-only `pwd` module. The UI surfaced the less useful later
   `GenerationMixin`/`AutoModel` import error. An exact sanitized-environment import
   reproduced the failure. Passing only the local `USERNAME` (OS fallback when the
   parent has none) corrected it without modifying Python, models or dependencies.
   Provider keys remain excluded. Real B and tuned-A generation then succeeded.
2. **Narrated MP4 failed after native video rendering.** Both `AudioEncoder` and
   `VideoEncoder` were absent in this Electron renderer. The old browser-based
   narration postprocessor could not encode AAC. Studio now uses bundled FFmpeg
   on the main side, a one-use Save-dialog path grant and the saved project layer.
   It verifies a temporary result before replacing the selected export. Tests
   cover untrusted callers, window ownership, repeated jobs, wrong/stale paths,
   changed layers/files, source preservation, cancellation and encoder/decode errors.

Both failing artifacts/logs were preserved before updating candidate bundles.

## Functional results

| Check | Result |
| --- | --- |
| Startup | Dedicated QA profile verified; Korean locale selected through the HUD renderer; project opened |
| Scene sheet | Three actual source videos loaded (`readyState=4`) at their planned source times |
| Animatic | Actual native pixels, playback/pause, jump to second scene and source-time seeking verified |
| Invalid proposal | 242-second first-scene range exceeded media; adoption/save/assembly disabled, error visible |
| Revision cycle | 19→20→19→20 seconds through proposal/adopt/undo/adopt; 1.8× manual zoom; previous check became stale |
| Assembly | New draft `proj_4e74bd10-82ec-4441-ac97-fd2a2ced5cad`, 3 clips and 1 zoom; source timeline stayed 19 seconds |
| B narration | Real local 4.64-second take; actual player progress; Apply enabled only after playing; saved at 1.5 seconds |
| Tuned A | Editing tone/direction invalidated audition; real 4.88-second take generated, played and applied |
| Voice content | Offline Whisper transcriptions of both takes matched the neutral requested Korean sentence, modulo spacing/punctuation |
| Restart | Full owned-process quit/relaunch restored the draft, 20-second plan, A tone, extra direction and 1.5-second offset |
| Reused narration | Explicitly enabled in plan; actual animatic audio played at the corresponding timeline offset |
| AI/motion availability | AI planning showed no configured provider and blocked generation; HyperFrames local runtime status was available; no model/render job submitted |
| Export | Actual Export UI → 1080p/H.264/30fps → native narration mix → saved-path success state |

Playback progress and ASR validate functional audio/content, not a new human
judgment of voice quality. Clone mode and fresh-machine model setup were not
retested in this pass. The previously owner-approved B style is retained.

## Final MP4 evidence

File: `qa-20s-narrated-ui-fixed.mp4` in the evidence root.
SHA-256: `6de97e1e96657d1eb23aa90eb577e3240656816db695e798b1ceb130bb74cd8a`.

- 1920×1080 H.264, 30/1 average FPS, **600 decoded frames**, video/container duration **20.000000 s**.
- AAC audio duration 19.989 s (packet-boundary difference); full video/audio decode passed.
- Cross-correlation against the applied WAV found the voice at **1.500000 s**, similarity **0.9999686**; peak 0.84322.
- All 600 decoded pictures match the preserved unmixed GUI output. Mixing did not alter the video.
- Full-resolution frames at 4/10/17 seconds confirmed the zoom, three readable captions and correct scene progression.
- Source QA timeline/annotations/zoom overlays were unchanged; planning metadata was explicitly saved separately.

## Automated checks and cleanup

Final full suite: **213 files, 2,402 passed, 4 skipped**. Narration-focused tests:
19 passed. Application/test TypeScript checks and production bundle build passed.

Each debugging pause closed its owned Electron app first. Final process PID 56064
exited **0**, its window was closed, and a process query found no remaining
Electron/Python command line belonging to this QA. `cleanup.json` records that
Computer Use was never started. Resetting a JavaScript kernel is not used as a
substitute for process/session cleanup.

This completes automated candidate verification, not public release approval.
