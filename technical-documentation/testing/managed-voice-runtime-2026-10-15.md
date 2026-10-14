# Dedicated voice runtime QA — 2026-10-15

Scope: `feat/studio-managed-voice-runtime`, a separate worktree based on PR #12
head `417bd16da6bb56a3d53740ad21e8233ab91de87d`. No installed-app replacement,
Computer Use, provider request, private voice upload, push, merge or release.

## Automated checks

- Full Vitest: **221 files, 2,457 passed, 4 skipped**.
- App/test TypeScript checks and changed-file Biome checks passed. Whole-repo
  lint checked 811 files with no errors and 13 existing warnings.
- Renderer/main/preload production build, documentation links, locale checks and
  `git diff --check` passed.
- Tests cover archive traversal, Windows device/ADS names, links, case aliases,
  bounded extraction, runtime versus model origin allowlists, manifest integrity,
  dedicated environment isolation settings, staged install, cancellation,
  failure cleanup and preserving previous configuration/external models.
- The direct `tar@7.5.22` dependency already existed transitively; shared
  `node_modules` was not changed. Only the lockfile/manifest were updated.
- Nix's old recorded fetcher-v1 hash was reproduced from the pinned 925-package
  cache/NAR before calculating the new lockfile hash. Native Nix execution/CI
  was **not** run on this Windows machine.

## Local compiled QA

Evidence root: `D:/purpleprint-build/studio-managed-voice-20261015`.
App: `candidate-final/qa-app`, with a new profile and the development dependency
junction. This is **not a self-contained Windows CI package or installer**.
All 19 native files came as a hash-matched set from PR #12's Windows CI payload
(run `38598577597`). Native sources were not changed.

Playwright Electron drove actual compiled UI controls without global desktop
mouse/keyboard control. Native file pickers alone used one-shot path-selection
fixtures. No physical picker, HUD/capture, driver installation or new-PC signoff
is claimed. Screenshots covered the plan, progress, success and 1280×800 layout.

The owner separately approved both the initial approximately 3 GB runtime
download and one clean retry. The existing pinned 4.52 GB CustomVoice model was
reused read-only; no model weights or personal recordings were uploaded.

### Initial failure and diagnostic changes

The first installation downloaded and installed its packages but failed during
the final runtime diagnostic. Its new runtime/download directory was removed
and no configuration was connected. The original error lacked sufficient
detail, so **its exact cause is not established**.

A temporary compatibility experiment using the new Python with libraries from
the previous environment succeeded. That experiment was not fresh-install QA;
its temporary `.pth` was removed. The implementation then gained an independent
venv, a five-minute cold diagnostic limit, visible import stages and bounded
app-local failure logs that survive runtime cleanup.

### Clean retry observations

| Check | Observed result |
| --- | --- |
| Consent and plan | Separate GPU diagnostic and install confirmations; plan displayed 2,981,833,399 download bytes and 18,014,218,935 required free bytes. No existing Python was selected. |
| Hardware | RTX 4060 Laptop, 8,188 MiB, compute 8.9, driver 572.16. Restricted-launcher ProgramFiles fallback was required for native NVML discovery. |
| Download/install | Production downloader checked exact sizes/SHA-256 for the pinned Python and all external wheels. Offline pip installed 89 pinned packages into the new venv, with no index/source build. Dependency check passed. |
| Cold diagnostic | New Python 3.12.15, CUDA available, BF16 supported. Completed in **185.328 seconds**, beyond the former 90-second bound. This supports a timeout hypothesis for the first attempt, but does not prove its cause. |
| Before connection | Runtime config was still absent while the GPU test sentence was being generated. |
| Test speech | Fixed Korean sentence produced a **2.96-second, mono 24 kHz PCM16 WAV**, 142,124 bytes. FFmpeg decoded the entire file without error. |
| Preview | Real HTML audio Play control reached `ended=true`, 2.96 seconds, with no media error. This checks playback, not a new subjective voice-quality rating. |
| Independence | Executable, base Python, venv prefix, torch, soundfile and qwen_tts paths all resolved inside the new root. User site-packages disabled. PyTorch 2.11.0+cu128 / CUDA 12.8. |
| Full restart | New Electron process restored preset availability and 1.7B tone control. Clone remained unavailable because its optional models were not configured. |
| Normal narration | From the normal Narration dialog after restart, generated a separate neutral sentence with default B tone: **3.68 seconds, mono 48 kHz PCM16**, 353,358 bytes. Apply was disabled until the actual preview control played; playback ended with no error and Apply then became available. |
| Save/reopen | Applied the take to a new 8-second synthetic-video QA project and saved it. Another full restart and project reopen restored the script, B tone, applied audio path/duration and media metadata without another generation. |

QA automation needed locator corrections for inline project renaming and the
project chooser. One import picker opened before the one-shot fixture was armed;
that owned QA app was closed immediately and the next launch used the fixture.
These were automation corrections, not production fixes. The narration dialog's
initial text was sampled before its asynchronous runtime check; the subsequent
saved screenshot shows the settled configured state.

All four final-candidate QA launches exited with code **0**. Computer Use was
never started. Existing installed EXE/ASAR, previous Python configuration,
requirements lock and prior QA runtime configuration matched their before hashes.
Final process inspection found **zero owned QA Electron/Python processes**.
All 12 reused model files still matched the pinned sizes/hashes. Parent PR
#10/#11/#12 worktrees remained clean at their original heads.

## Remaining scope

Dedicated setup currently targets Windows x64 with a supported NVIDIA GPU.
Fresh OS/driver installation, CPU/Mac, complete new-model weight transfer,
physical OS picker/capture checks, self-contained CI packaging, signatures and
updates remain separate gates. Successful-runtime removal/update UI and download
resumption are not implemented. Automatic cloning/transcription setup is outside
this change. No MP4 export claim is added by this runtime test.
