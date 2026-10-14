# Windows CI runtime-setup QA — 2026-10-14

Result: the untouched Windows CI payload passed the isolated setup checks below.
[Draft PR #11](https://github.com/PurplePrintAI/openscreen-subscription/pull/11)
targets `fix/studio-export-duration` and depends on #10. Neither PR was merged;
no release or installation was performed.

## Build identity

- Implementation: `78d484c7587ed6cb23c1b4850cee60a55b7e3cbf`.
- [General CI 38577547016](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/38577547016): all 11 applicable jobs passed, including Linux-hosted Vitest **2,419 passed / 1 skipped**. The PR-title job is skipped on push events.
- [Windows clean package 38577547425](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/38577547425): passed; explicitly dispatched at the implementation head because the stacked base is outside the fork/main Windows PR trigger.
- Artifact: `purpleprint-studio-windows-x64`, ID `11900469243`.
- Installer: `PurplePrint-Studio-1.10.0-subscription.11-Windows-x64-Setup.exe`,
  246,079,594 bytes, `NotSigned`. SHA-256:
  `bab06ecf6dced4f0f253ecf2e80f48bd758922de93718026b8e4608b09797004`.

The installer, blockmap and update-feed hashes matched the CI checksum list.
Setup was **not executed**: the complete `app-64.7z` payload was extracted instead.
The package identity, compiled setup IPC, all 19 native files and source-matching
narration scripts were checked. Electron reported `isPackaged=true`, the extracted
executable, its own `resources/app.asar` and the explicitly isolated userData path.
No developer node_modules or native-module replacement was used.

## Method

Local evidence root: `D:/purpleprint-build/studio-setup-ci-qa-20261014`.

Playwright Electron operated real renderer controls and production IPC. Only the
native file/directory chooser used one-shot QA selections of known existing paths.
Validation, consent, saves, runtime resolution and restart persistence were real.
This is not a physical OS-dialog test. Computer Use and global input were not used.

Fresh QA profiles and isolated appdata/temp directories were used. No credentials,
conversation history or personal voice references were copied. CLI discovery was
observed in this isolated environment, not asserted to be a complete inventory of
the owner's regular login environment. No sign-in, model-generation, motion-render
or runtime-download action was requested.

## Results

| Case | Observed result |
| --- | --- |
| Empty profile | Korean setup labels, neutral unselected guidance, optional-tool explanation and discovery-versus-account-access distinction visible. |
| Invalid model | An empty folder selected as CustomVoice blocked Save; no config file was created. |
| Picker cancellation | Cancel after choosing Python preserved the previous selection. |
| Voice save | Existing Python/CustomVoice/Base/faster-whisper paths validated; Save stayed disabled until explicit trust. Configuration was written only to QA userData. |
| Motion save | Existing pinned runtime validated; separate trust acknowledgement preceded its app-local config save. |
| Live feature status | Narration and HyperFrames recognized saved settings without restarting the process. No generation/render started. |
| Full restart | Both saved configurations reappeared in a new app process. |
| Discard and close | Discarding a wrong model choice restored saved paths; closing after an invalid motion choice also left both saved JSON files unchanged. |
| Explicit overrides | Separate QA environment overrides made all voice/motion pickers and Save buttons read-only. Override bytes stayed unchanged; no app-local config was created in that profile. |
| Missing-runtime recovery | Voice generation and motion render remained disabled. Both feature links opened Setup; HyperFrames technical details were collapsed behind localized guidance. |
| Layout | Startup and approximately 1280×800 content-size views inspected. Long paths wrapped; required controls were reachable by intentional internal scrolling. |

No runtime code correction was required by this package pass. The follow-up
commit records results only; it does not change the tested runtime implementation.

## Preservation and cleanup

All **190 package files** retained their hashes. All **four protected files**
retained their hashes: the installed Studio executable/ASAR and the original
voice/motion runtime configuration files. Runtime directories were not modified;
Claude-owned work and the existing installed profile were not touched.

The configuration, restart, override and missing-runtime QA processes each closed
with exit code **0** immediately after their checks. A final process query found
**zero** owned app/voice/CLI processes remaining. No Computer Use session started.
Local screenshots, profiles and paths were not uploaded to the public PR.

## Not signed off

Automatic installation/download, fresh-PC dependency setup, actual Python/GPU
generation, HyperFrames rendering, physical capture/HUD/tray/pickers, OS installer
and updater behavior, signing and Mac/CPU runtime support are not tested by this
pass. This setup feature connects **already prepared** runtimes; file validation
is not execution validation. Parent #10's separate production/export QA remains
the reference for that workflow. Release approval remains deferred.
