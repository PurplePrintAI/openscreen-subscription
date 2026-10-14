# Preset voice setup QA — 2026-10-15

Scope: `feat/studio-narration-install`, separate worktree based on PR #11 head
`afeaa1ad17b9eb07e7b1ebeed64d13c0ac1a3de5`. PRs #10/#11, the installed Studio,
existing runtime/model directories and Claude-owned work were preserved.
No Computer Use, installer execution, remote AI request, merge or release.

## Automated checks

- Full Vitest run: **220 files, 2,441 passed, 4 skipped**. The download/service
  tests were rerun after cleanup hardening: 17 passed.
- App and test TypeScript checks, production renderer/main/preload build passed.
- Whole-repository lint passed with 13 existing warnings and no fixes; changed
  files were formatted. Documentation link checks and `git diff --check` passed.
- Tiny synthetic manifests/fake transport test explicit consent, native-only
  paths, byte/hash mismatch, unsafe redirects, cancellation, existing destination,
  stale/expired plans, owner invalidation, configuration conflicts, platform,
  override and free-space gates. No model weights are downloaded by tests.
- IPC tests cover origin/main-frame validation, duplicate starts, responsive
  status/cancel during long operations, owner close and quit-time cleanup.
- Preset-only generation and independent preset/clone UI capability tests passed.

## Isolated compiled app

Evidence root: `D:/purpleprint-build/studio-narration-install-20261015`.
Developer QA app: `candidate/qa-app`, with its own profile and a local dependency
junction. This is **not** a self-contained installer or a new CI package.

All 19 native files were copied and hash-matched as a set from the previously
verified PR #11 Windows CI payload, run `38577547425`. Native sources are unchanged.
No original profile, provider credentials or private reference recordings were copied.

Playwright Electron operated the compiled renderer/main process without global
mouse/keyboard control. Only native pickers were replaced with one-shot QA path
selections. This does not validate physical OS dialogs, capture or a fresh PC.

| Check | Observed result |
| --- | --- |
| Empty profile | No automatic diagnostic/download; trust is required before diagnosis. Missing Python/storage blocked connection. |
| Real diagnostic cancellation | Cancel interrupted the running local diagnostic; retry completed. |
| Download plan | Python 3.12.13, CUDA, RTX 4060 Laptop / 8 GiB detected. Displayed 4.21 GiB download (4,520,217,432 bytes), 4.71 GiB required free space and chosen D: destination. Download was **not** confirmed. |
| Transport smoke | Production downloader fetched the official pinned model card, 57,846 bytes, and checked SHA-256. No weights downloaded. Large CDN weight transfer remains unverified. |
| Reuse | All 12 files in the existing D: 1.7B CustomVoice snapshot matched size/SHA-256. Plan displayed zero download bytes; explicit confirmation reverified and saved only the QA configuration. |
| Dependency split | New config contains only `pythonPath` and `presetModel`. Preset available, clone unavailable; clone/reference controls remain gated. |
| Actual speech | UI generated the neutral test sentence with default B tone. Produced a fully decoded 2.96-second, mono 48 kHz PCM WAV without clone/transcription models or private references. |
| Preview / apply | Native HTML audio control played to the end with no media error. Apply was disabled before preview, then enabled; the take was saved to the QA project. This is playback verification, not a new subjective voice-quality assessment. |
| Full restart | New app process restored paths, preset-only capability, script, B tone and applied narration. No additional generation. |
| Display / exploration | Initial, plan, connected and unavailable-clone states inspected. Also checked 1280×800, wrapped paths, reachable internally scrolling controls, picker cancellation and download/reuse mode round-trip. |

Two automation locator corrections were needed: the first form locator matched
both chat and project-name inputs, and a restart matched multiple audio elements.
Scoping to the named input/dialog resolved these without production changes.

## Cleanup and limits

Both owned QA app launches exited with code **0**. Final process inspection found
zero owned Electron/Python processes. Computer Use was never started. Installed
EXE/ASAR and the previous runtime configuration matched their pre-QA SHA-256.
The original PR #10/#11 worktrees remained clean.

Remaining gates: fresh-machine Python/package/driver provisioning, a complete
4.52 GB weight download on a new machine, real native-picker/manual desktop QA,
new Windows CI packaging, signed installer/update tests, CPU/Mac support, automatic
clone/transcription installation and interrupted-download resumption. No MP4
export claim is added by this model-setup test; previous narration/export QA is
recorded separately. Existing models are reused, not modified or removed.
