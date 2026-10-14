# Local runtime setup QA — 2026-10-14

Scope: separate `feat/studio-runtime-setup` worktree based on PR #10's
`9aa17b213b9449d957450de31bdc0cf4a961de17`. Existing PR #10, installed Studio,
original profiles/models and Claude-owned work were not changed. No merge,
release, installer execution, runtime download or model generation occurred.

## Checks

- Full Vitest suite: **216 files, 2,416 passed, 4 skipped**.
- App and test TypeScript checks, production renderer/main/preload build passed.
- Whole-repository lint: no errors or applied fixes; 13 existing warnings remain.
- Service/UI tests cover read-only discovery, save consent/schema, native-picker
  cancellation, owner invalidation, wrong model roles, removed weight files,
  conflicting writes, environment overrides, restart configuration and pinned
  motion-runtime resolution. IPC tests reject foreign origins/subframes and
  renderer-supplied paths; repeated requests are serialized.

Evidence root: `D:/purpleprint-build/studio-runtime-setup-20261014`.
The compiled developer QA folder uses its own bootstrap/profile and the complete
19-file native set copied and hash-checked from the previously verified Windows
CI package. It is not a new self-contained installer or CI package.

## Real renderer and main-process QA

Playwright Electron operated the compiled app without Computer Use or global
mouse/keyboard input. Native file/directory dialogs alone were replaced with
one-shot QA selections of known existing runtime paths. Validation, draft state,
consent controls, disk persistence and feature status checks used production code.
This does not sign off physical OS dialogs or a new machine's installation flow.

| Check | Result |
| --- | --- |
| Empty profile | CLI executable discovery is distinct from account access; optional tools do not block basic video editing. |
| Invalid model selection | Choosing the QA app folder as CustomVoice left Save disabled. |
| Voice selection | Existing Python, CustomVoice, Base and faster-whisper paths validated; selected weight files totalled 5.72 GiB. |
| Explicit trust | Save stayed disabled before acknowledgement, then wrote only the QA profile's runtime JSON. |
| Motion selection | Existing pinned HyperFrames folder validated and saved; its source local-runtime.json remained unchanged. |
| Cancel/reset | Cancelling the native picker preserved selection; discarding an invalid draft restored saved paths. |
| Live recognition | Narration and HyperFrames dialogs recognized the saved runtime without restarting the app. No generation/render started. |
| Restart | A new owned app process restored both saved configurations. |
| Navigation | Setup opened the existing AI-settings flow; both missing-runtime feature dialogs opened Setup. No sign-in or model request submitted. |
| Display | Initial view and approximately 1280×800 view inspected; long paths wrap, modal controls are reachable by intentional internal scrolling. |

An actual regional-locale defect was found: `ko-KR` initially rendered the new
labels in English. Prefix-based Korean detection corrected it, with a `ko-KR` UI
regression fixture. Empty untouched fields now show neutral selection guidance;
invalid selections retain warnings. HyperFrames raw errors are collapsed under
technical details, with Korean recovery guidance and a setup button first.

One restart check initially reused a stale automation-helper app handle; the
current process was still running. Passing the current app/page explicitly to
the helper resolved that automation issue; it was not an app crash.

## Cleanup and remaining scope

Both configured and empty QA apps closed with exit code **0**. Process checks
found zero owned Electron/voice/CLI children remaining. Computer Use was never
started. QA media/screenshots/local paths remain local, not uploaded.

This step connects **already prepared** runtimes. Automatic CLI/model installation,
download-size planning/free-space checks, runtime dependency repair, fresh-PC
setup, Mac/CPU support and installer/update validation remain separate work.
The displayed weight-file size is not an installation/download estimate. File
validation does not prove Python imports or GPU execution; those remain explicit
generation-time checks. Voice consent is still collected separately for cloning.
