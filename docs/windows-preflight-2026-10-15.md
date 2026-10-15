# Windows pre-release verification plan — 2026-10-15

Branch: `test/studio-windows-preflight`, isolated from PR #13 head `ee194e06`.
Runtime under test: unchanged final Windows CI package from run `38692993406`,
source `35a7da3b177cd21e83ef773e3c21788d65becfc6`, artifact `11953426673`.
This branch is local verification work, not a merge/release or installation into
the owner's existing Studio directory.

Completed within this scope: approved fresh 7.50 GB provisioning from the CI
payload, failure-injection recovery, nine-project GUI compatibility and narrated
MP4/restart checks. See the [verification report](../technical-documentation/testing/windows-preflight-2026-10-15.md).
NSIS installation, another PC/driver and the other release gates remain separate.

## Safety and evidence

- Reuse the cached CI artifact; verify all 193 extracted files before testing.
- Keep profiles, temporary files, copied projects and new runtime under
  `D:/purpleprint-build/studio-windows-preflight-20261015`.
- No Computer Use, global input, provider call, private upload or Claude changes.
- Use Playwright Electron and one-shot native-picker QA selections. This does
  not sign off physical dialogs, HUD/capture, OS installation or a fresh OS.
- Copy project/media/chat fixtures; never open/save the originals in the QA app.
- Close each owned app after its checks and verify process exit. Do not close
  other apps. Hash the original inputs and package before/after.

## Verification inventory

1. Fresh profile: no configured Python or model; GPU/space diagnosis and separate
   consent. Do not start a network download until the owner approves its size/path.
2. Packaged failure recovery with **network-free injected transport**: HTTP error,
   truncated response/hash rejection, cancel during transfer and app quit during
   transfer. Real service/staging/cleanup must preserve a baseline configuration.
   Record these as fault-injection checks, not actual internet-outage tests.
3. Fresh installation after separate approval: download pinned Python, all wheels
   and the complete CustomVoice model into a new root. Do not reuse the old model,
   Python or cache. Validate stage logs, GPU execution, test speech, preview and
   connection only after success. A repeated multi-GB transfer requires reapproval.
4. Legacy compatibility: copy the installed profile's eight project documents,
   referenced media and the existing QA chat. Copy an advanced three-scene plan
   with preset narration. Preserve IDs/content and remap only copied local paths.
   Exercise packaged parsing, representative UI reopen/save, restart, plan/
   narration persistence and MP4 decode without additional AI calls.
5. Check initial/plan/error/connected layouts plus a smaller viewport. Check
   missing storage, invalid models and existing-configuration preservation.
6. Final boundary: existing installed EXE/ASAR, original project/chat/media files,
   models and parent worktrees unchanged; no owned QA processes remain.

New-runtime download is approximately 7.50 GB; reviewed working-space requirement
is 22,534,436,367 bytes (20.99 GiB). This tests a fresh software environment on the
current supported NVIDIA PC, not a different GPU/driver or fresh Windows image.
Hard-crash recovery, signed NSIS installation and automatic updates remain
separate checks unless explicitly added to the scope.
