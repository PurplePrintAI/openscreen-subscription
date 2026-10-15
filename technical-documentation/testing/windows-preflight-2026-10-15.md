# Windows pre-release checks — 2026-10-15

**Partial result: network-free failure recovery and copied-project compatibility
passed. Fresh runtime/model installation has not started; download approval is
pending. This is not release approval.**

Separate worktree: `D:/dev/openscreen-studio-windows-preflight`, branch
`test/studio-windows-preflight`, based on PR #13's documentation head `ee194e06`.
Tested binary: the unchanged final CI package from run `38692993406`, runtime
source `35a7da3b177cd21e83ef773e3c21788d65becfc6`, artifact `11953426673`.
All 193 cached payload files were verified and copied locally; no new artifact
download or installer execution was needed.

## Network-free failure recovery

Playwright Electron drove the actual packaged installer UI and main-process
service. A QA-only replacement of the owned process's global fetch returned
synthetic responses instead of making network requests. Production staging,
integrity checks, cancellation and cleanup were not replaced. This is fault
injection, not evidence of an actual internet outage.

| Scenario | Result |
| --- | --- |
| HTTP 503 | `download-http`; newly created runtime removed, existing config unchanged. |
| Truncated 64 KiB body | `download-integrity`; partial file/runtime removed, existing config unchanged. |
| Cancel during pending response | `cancelled`; pending reader stopped and owned runtime removed. |
| Normal app quit during pending response | Exit 0 after cleanup; config unchanged and no owned runtime remained. |
| Restart after quit | Installer returned idle, baseline config unchanged, storage directory empty. |

Failure reports remained in the isolated profile. The test process was closed,
so its injected fetch function cannot affect subsequent fresh-install checks.
Hard kills, power loss and resumable downloads were not tested.

## Existing project compatibility

Copied the installed profile's eight schema-v7 projects, their media, the existing
QA conversation, and one advanced three-scene/preset-narration project from earlier
integration QA. Ten media files were copied and hash-matched. Only exact local
media-path values were remapped; project/asset/clip IDs and authored data stayed
unchanged. No account credentials, provider settings or private reference-voice
configuration were copied. No remaining original media paths were found in the
copied documents.

- All **nine projects** opened and saved through the packaged GUI without alerts.
  Semantic comparison preserved project identity/title, asset identity/source/
  duration, timeline, transcripts, annotations, zooms, scene plan and narration.
- The advanced project restored **three scenes / 20 seconds**, and its native
  animatic played with the existing captions and zooms. The 1280×800 paused view
  was inspected.
- The existing **4.88-second preset audio** played to the end without a media
  error even though this QA profile had no narration runtime configured.
- The advanced project exported **20.000 seconds, 1920×1080, H.264 60 fps,
  AAC stereo 48 kHz**, 8,026,505 bytes. Full FFmpeg decode passed. No new speech or
  AI generation was requested.
- Both stored QA messages (user and assistant) appeared in the UI. A complete
  restart restored those messages and the advanced scene plan/narration metadata.
- A preliminary legacy CLI `info` probe returned exit 0 but null/empty legacy
  fields for schema-v7 files. It was **not used as compatibility evidence**;
  the GUI checks above are authoritative. CLI schema-v7 reporting is a separate
  limitation, not a passing result from this work.

Native open/save pickers used one-shot QA selections. The artificial QA home has
no Windows Downloads known-folder registration, so the owned Electron process's
Downloads path was explicitly mapped to its QA folder. No registry or real
Downloads change was made. No physical native picker/HUD/capture claim is made.

## Fresh installation gate

A separate empty profile passed the real GPU/storage preflight with no configured
Python or model. The plan requires **7,502,050,831 download bytes** and
**22,534,436,367 free bytes (20.99 GiB)**. The current NVIDIA RTX 4060 Laptop/8 GiB
and D: free space passed. The install button was **not pressed**. The app was closed
while awaiting the owner's separate approval, and no fresh runtime config exists.

After approval, install Python, all wheels and the complete model into a new
directory without reusing the prior runtime/model/cache, then verify actual test
speech, preview, connection and restart. This is a fresh software environment on
the current PC, not a fresh Windows image or different driver/GPU.

## Preservation and status

Evidence remains local under `D:/purpleprint-build/studio-windows-preflight-20261015`.
All **193 package files**, **20 original project/chat/media files** and **6 protected
installed/runtime files** retained their hashes. All **five GUI QA launches**
exited 0; final inspection found zero owned QA processes. Computer Use was never
started, and no additional downloads began. Existing installation and Claude
work were not modified. No push, PR, merge or release was performed in this pass.
