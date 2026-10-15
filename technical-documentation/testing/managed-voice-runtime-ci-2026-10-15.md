# Windows CI dedicated voice runtime QA — 2026-10-15

Result: the final Windows CI payload passed the isolated checks below.
[Draft PR #13](https://github.com/PurplePrintAI/openscreen-subscription/pull/13)
targets `feat/studio-narration-install` and depends on #12. Parent PRs and the
installed Studio were not changed. No Computer Use, merge or release.

## Build identity

- Implementation: `4eb89b57c12ef36b2ffabf84ce85c0b44f42a1ef`.
- Final tested source: `35a7da3b177cd21e83ef773e3c21788d65becfc6`, which fixes
  duplicate missing-storage warnings found in the first packaged QA pass.
  The existing service regression test was extended; all 12 targeted tests passed.
- [General CI 38693002220](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/38693002220): all 12 jobs passed; Linux Vitest **2,460 passed / 1 skipped**, 221 files.
- [Nix 38693002378](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/38693002378): the recorded dependency hash matched the lockfile.
- [Windows clean package 38692993406](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/38692993406): passed; manually dispatched because the stacked base is outside the Windows PR trigger.
- Artifact `purpleprint-studio-windows-x64`, ID **11953426673**.
- Installer `PurplePrint-Studio-1.10.0-subscription.11-Windows-x64-Setup.exe`,
  **246,454,947 bytes**, `NotSigned`, SHA-256
  `379f989437d08b9b76d28d778d4be42ba4251db90fd22a9836249fdc277aa55c`.

Installer, blockmap and feed matched the CI checksum list. Setup was **not
executed**: the full app-64.7z payload was extracted. No native files, ASAR or
developer dependencies were substituted. All 19 native files were present;
compiled managed-runtime markers and source-matching Python scripts were checked.
The bundled SoX wheel matched its pinned digest and contains its BSD license.

## Method and scope

Local evidence: `D:/purpleprint-build/studio-managed-voice-ci-qa-20261015/final`.
Playwright Electron operated the extracted production EXE. It reported
`isPackaged=true`, its own ASAR and the explicitly isolated userData directory.
Separate appdata/temp/home directories were used; no existing user profile,
credentials, conversation history or private voice recordings were copied.

The **fresh Python/package installation** was already tested in the
[local implementation pass](managed-voice-runtime-2026-10-15.md). This CI pass
reused that newly provisioned Python/venv and the pinned existing model. It did
not download or install another approximately 3 GB runtime or 4.52 GB model.
Managed-install plans, deployment resources and safety gates were checked, but
fresh provisioning from the CI binary is not claimed.

Native pickers used one-shot QA file selections. The deliberately artificial
USERPROFILE lacked Windows' Downloads known-folder mapping: export initially
stopped before the save picker with `Failed to get 'downloads' path`. Setting
Electron's in-memory Downloads path to the owned QA folder resolved that harness
issue. No source/package change, registry edit or real Downloads write was made.
This is not a physical Windows picker test.

## Results

| Case | Observed result |
| --- | --- |
| Empty profile and consent | No automatic download; managed mode did not require Python selection. Diagnosis required consent. Missing storage produced exactly one warning in the corrected package. |
| Managed plan | Real NVIDIA diagnostic identified RTX 4060 Laptop / 8,188 MiB / driver 572.16. New-runtime-plus-model plan displayed 7,502,050,831 download bytes and 22,534,436,367 required free bytes. Install was not confirmed. |
| Safety and recovery | Cancelled native selection retained the storage path. An empty model folder was rejected. Cancelling a running diagnostic returned to a retryable cancelled state. No runtime directory or configuration was created. |
| Reuse and connection | Packaged offline probe passed Python 3.12.15/CUDA in 48.14 seconds. All model files were hashed. Explicit zero-download confirmation saved only the QA config. |
| Actual generation | Normal Narration UI produced a 3.68-second Korean B-tone take using the dedicated venv. Preset/tone controls were available; optional cloning remained unavailable. No remote AI request. |
| Preview and apply | Apply stayed disabled before preview. The actual audio control played to the end with no error, then Apply became enabled. The take was applied and saved to a new 8-second synthetic-video project. |
| MP4 export | Real app controls exported **8.000 seconds, 1920×1080, H.264, 60 fps, AAC stereo 48 kHz**, 752,704 bytes. FFmpeg decoded the entire output without errors. Audio mean -22.6 dB / peak -5.1 dB confirmed a non-silent track. |
| Full restart | A new process reopened the QA project and restored the runtime, script, B tone and applied 3.68-second audio with no additional generation. |
| Explicit override | Separate override profile showed read-only guidance; installer entry and voice Save were disabled. No app-local narration config was created. |
| Visual checks | Managed plan and restored narration inspected; 1280×800 view retained readable text, wrapped paths and reachable internally scrolling controls. |

The first QA launch had a test-harness handle-scope error and was closed before
continuing. Other locator adjustments respected asynchronous consent resets and
the disabled override entry. One post-export screenshot timed out; export UI
text, the output file and complete decode/audio checks were recorded instead.
The later restoration screenshot succeeded. None of these automation corrections
changed the shipped package.

## Preservation and cleanup

All **193 final package files**, **6 protected files** (installed EXE/ASAR and
previous runtime/configuration inputs) and **12 model files** retained their
expected hashes. No bytecode appeared in packaged narration resources.
The final storage folder remained empty; no runtime/model download occurred.

All **three final-candidate QA launches** closed with exit code **0** immediately
after their checks, as did both initial-candidate launches. Final inspection
found **zero owned app/Python/FFmpeg/CLI processes**. Computer Use was never started.
Local screenshots, profiles and audio/video evidence were not uploaded to the PR.

The documentation-only follow-up does not alter the tested runtime source.
Fresh OS/driver provisioning, fresh provisioning by the CI binary, complete model
weight transfer, physical native capture/HUD/pickers, signed installer/update
behavior, CPU/Mac support and release approval remain separate gates.
