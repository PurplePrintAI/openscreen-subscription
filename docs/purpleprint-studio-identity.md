# PurplePrint Studio identity

Status: unsigned `.9` Windows candidate installed on the owner's PC for
validation; `.10` source candidate adds Windows release preparation. No Studio
release has been published.

PurplePrint Studio is the agentic film editor intended as a video-production
companion to PurplePrint Design Coach's GTM and operating phases. GraphOS is the
developing top-level PurplePrint product. This fork does **not** currently share
GraphOS runtime state or consume Design Coach/MCP project context; that handoff
belongs to the Design Coach/MCP workstream, not this frontend identity change.

## Visual contract

- Neutral dark surfaces are the default. Light mode remains available and an
  existing explicit light preference is respected.
- Violet identifies the PurplePrint family, focus, selected tools and primary
  actions. It does not replace the functional colors for recording, progress,
  success, warnings or errors.
- Borders and small elevation steps carry panel hierarchy. Overlays can be more
  prominent, while the editing surface and footage remain the visual focus.
- The editor's minimum 800px desktop width retains mode and export controls;
  chat and the inspector start collapsed when their width would crowd the stage.

The implementation lives in `src/styles/design-tokens.css` and the active editor
and capture surfaces. The checked-in Studio icon assets are generated from
`public/purpleprint-studio.svg` geometry by
`scripts/generate-studio-icons.py` (Pillow is needed only to regenerate them).

## Compatibility and provenance

- Visible product name: **PurplePrint Studio**. Descriptor: **Agentic Film Editor**.
- The fork's technical app ID, package/data profile name, GitHub update origin,
  `.openscreen` project extension and `openscreen` CLI command remain unchanged.
  Test these boundaries in a packaged upgrade before a public release.
- Preserve the upstream MIT license, copyright notices and independent-fork
  disclosure. Do not imply OpenScreen maintainer endorsement.
- Do not add a paywall to this editor as part of the Design Coach bundle.

## Release gate

Before publishing a Studio installer: verify updater behavior from the
product-named installation directory and obtain a clean Windows native
packaging pass. A user-driven Windows record → edit → MP4 export passed on
installed `.9`; `.10` changes update discovery but is not installed yet.
A separate macOS release still needs a real Mac record → edit → export pass.
A stable Mac consumer release additionally needs Developer ID signing,
notarization and a privacy-permission review. Design Coach/MCP linkage is a
separate workstream.

| Gate | Current evidence |
| --- | --- |
| Windows package identity | The `.9` unsigned NSIS package contains the corrected `dist/wasm/web-demuxer.wasm` path. Owner-approved installation reused the existing per-user location without another nested folder. Registered and executable versions report `.9`; nine installed payload files match the unpacked build, and the Start-menu shortcut points to the installed executable. A fresh local compositor rebuild was blocked by missing `libclang.dll`, so packaging reused the already-validated `.8` binary with a matching SHA-256. |
| Profile continuity | Installed OpenScreen Subscription `.7` created an isolated-profile project with synthetic H.264 media. Studio `.8` reopened its clip, light theme and preferences, then exported a decodable MP4. On the owner's live profile, three project documents and the AI configuration were hash-identical to the verified pre-install backup. The installed `.8` binary separately loaded copies of all three real project documents and opened the editor without outputting their contents; private footage was not exported. |
| Windows native capture | Packaged WGC recorded a generated QA window with microphone, system audio and camera disabled. The saved project reopened and exported a decodable MP4. Control was automated below the OS hit-test. The owner separately confirmed that the installed `.8` HUD opened the source selector, recorded six seconds and stopped with a physical mouse; Studio opened the project. On installed `.9`, the owner repeated a short silent recording, saw the project open without an error toast, and exported MP4 successfully. |
| Silent-recording transcription | The `.8` recording contained video but no audio stream. Automatic transcription showed "Failed to fetch" because its WASM URL resolved outside packaged `dist/wasm`. Installed `.9` corrected the URL: another video-only recording produced no error toast, and its saved asset carries the expected `no-audio` verdict. |
| Installation upgrade | Owner-approved `.8` NSIS upgrade reused the per-user uninstall registration and created a product-named child folder under the previous custom root. The subsequent `.9` upgrade reused that exact folder. Before `.9`, the profile and installation were backed up and 8 critical project/recording/config hashes matched; they remained unchanged after upgrade. The `.10` source candidate fixes release discovery for the fork's `subscription` prereleases. Download/install behavior from this path still needs review before publication. |
| macOS | [CI run 36358715037](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36358715037) built `.9` Apple Silicon and Intel DMGs from commit `f81a8b9d`. Both passed bundle ID, architecture, native payload, ad-hoc signature structure, CLI boot and mounted-DMG checks; downloaded SHA-256 values matched the workflow report. Real Mac recording/edit/export, Developer ID signing and notarization remain unverified. |

The source selector failed to list the QA window on the first automated attempt
after it appeared, then found it on retry. Treat that as a transient observation,
not evidence that source discovery is reliable on every launch.
