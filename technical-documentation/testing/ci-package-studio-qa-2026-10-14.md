# Windows CI package Studio QA — 2026-10-14

Result: the **unmodified CI package** passed the isolated production-workflow
checks below. This is not installation, update, physical capture or release
approval. PR #10 remains a draft; no merge or release was performed.

## Build identity and isolation

- [Windows clean-package run 38564596005](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/38564596005): success.
- Implementation head: `556c7f160b00a26209144d19524c8468c589df85`.
- CI merge commit: `3a124d6096b6c99af7c1e081b00d423878488713`; its tree
  `4a7c4dce66fb462b0baa0845ec5d923c51919fb3` equals the implementation head's tree.
- Artifact: `purpleprint-studio-windows-x64`, ID `11895551012`.
- Installer: `PurplePrint-Studio-1.10.0-subscription.11-Windows-x64-Setup.exe`,
  246,070,976 bytes, unsigned. SHA-256:
  `74bc47059c3014ce6d28e201549c7bbcc64e023f897ae268944f374cd1d7ddf7`.

Installer, blockmap and update-feed hashes matched the CI checksum file. The NSIS
archive's complete `app-64.7z` payload was extracted without executing Setup.
No installed files, registry registration or shortcuts were replaced.

QA root: `D:/purpleprint-build/studio-ci-package-qa-20261014`.
The packaged executable was launched with an explicit new `--user-data-dir`.
Electron reported `isPackaged=true`, the QA profile, the extracted executable and
its own `resources/app.asar`. There was no development `node_modules` junction or
replacement native addon. The package includes all 19 Windows native files and
the narration Python scripts; Python/models and HyperFrames remain external.

Only copies of an approved QA recording/project and a previously generated
neutral preset WAV were seeded. No login, conversation, personal recording or
voice-clone reference was copied. No live AI request or media upload occurred.
Existing local voice-runtime paths were configured explicitly in this QA profile
after testing the missing-runtime state; no model download/install occurred.

## Method and limits

Playwright Electron operated actual renderer controls and production IPC/native
code. No Computer Use session or global mouse/keyboard control was used. The
Windows Save dialog alone used a one-shot QA-selected path in the owned process;
rendering, encoding, mixing, verification and writing were real.

One early automation attempt used a button locator for a tab and timed out. Its
processes were confirmed gone before restarting; tab-role locators and shorter
bounded waits were then used. Automation interruption is not counted as a passing
product check. The final restart/export/cleanup pass completed, with exit code 0.

This is not a physical Save-dialog, HUD hit-testing, tray, microphone/webcam,
recording, installer/UAC, automatic-update, new-PC or macOS/Linux runtime test.
CI compilation/tests on other platforms do not replace those tests.

## Verified controls and states

| Check | Observed result |
| --- | --- |
| Missing narration runtime | Korean unavailable/no-automatic-download guidance; Generate disabled. Existing saved audio loaded and actually played without the model runtime. |
| Missing HyperFrames runtime | Unavailable status and Render disabled; no installation or render started. Raw English path error remains a setup-UX limitation. |
| Unconfigured AI | Provider-required notice and payload/consent boundary visible; no provider request submitted. |
| Scene sheet | Three source videos loaded at 12.5/45/67 seconds, all `readyState=4`. |
| Animatic | Native picture/captions, play/pause, second-scene jump, keyboard seeking and actual narration clock progress verified. |
| Invalid revision | 242-second scene exceeded source duration; adoption, save and assembly were blocked. |
| Valid revision | 19→20→19→20 seconds through adoption/undo/readoption; 1.8× zoom at (0.75, 0.4); prior picture check became stale. |
| Assembly | Separate three-clip, 20-second draft with one zoom. Source timeline/annotations/zoom remained unchanged at 19 seconds; the accepted plan was saved separately. |
| Packaged narration worker | Explicit local 1.7B CustomVoice runtime: one neutral B take generated, duration 4.64 seconds. No personal voice used. |
| Audition gate | Apply disabled before playback, enabled after actual playback, disabled after direction edit; restored selection was replayed before application. |
| Restart | Full process restart restored the draft, 20-second plan, B tone and 1.5-second narration offset. |
| Cancelled edit | Proposing a 9-second scene then cancelling kept the accepted 20-second plan. |
| Export UI | 1080p, H.264, 30fps completed and displayed the selected saved path. |

The startup 1740×931 editor and approximately 1280×800 content-size pass were
inspected. Modal forms intentionally scroll; their controls remained reachable.
At the smaller size, mode labels are abbreviated and the rightmost timeline
shortcut hint is clipped. These are remaining responsive-layout polish items,
not a claim of complete visual-release sign-off. Native animatic pixels and
full-resolution export frames were reviewed separately from DOM state.

Playback progress and signal comparison verify functional audio, not a new human
judgment of voice quality. Clone mode and HyperFrames rendering were not rerun.

## Export measurements

Local result: `evidence/ci-package-20s-narrated.mp4`, 7,324,938 bytes.
SHA-256: `80c308c1daa129c8fd98a696a1cf09f7be11523d3259337d92c5b4f77ff4a70d`.

- H.264 1920×1080, 30/1 fps, **600 decoded frames**, video/container **20.000000 s**.
- AAC audio 19.989 s (packet-boundary rounding); full audio/video decode passed.
- Correlation with the applied WAV found narration at **1.500000 s**, similarity
  **0.99998635**, peak 0.84173.
- Full-resolution 4/10/17-second frames show the expected zoom, three readable
  Korean captions and source-scene progression.

Evidence, images, media, the original artifact and the QA profile stay local.
Only this sanitized record and measurements are included in the public PR.

## Preservation and remaining gates

All **190 extracted package files** retained their hashes. Six protected input
files retained their hashes, including the prior QA documents, recording/preset
WAV and the installed Studio executable/ASAR. Original project timeline and
overlays were unchanged. Claude-owned work was not modified.

Final QA PID 92476 exited **0** after an awaited close. A subsequent process query
found **zero** owned app/voice-worker processes. Computer Use was never started.

No runtime code change was required by this package pass. The documentation
follow-up does not change the verified implementation tree. Before distribution:
finish user-facing runtime setup, resolve raw HyperFrames configuration errors,
check a clean/new PC and physical capture/dialogs, then separately authorize
installer/update validation and publication. Do not treat this QA as a release.
