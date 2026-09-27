# PurplePrint Studio identity

Status: unsigned `.9` Windows candidate built but not installed; unsigned `.8`
candidate installed on the owner's PC for validation. No Studio release has
been published.

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

Before publishing a Studio installer: retest the `.9` automatic-transcription
fix in an installed app, verify the installed app's real-project export path and
update behavior from its product-named child directory, and run a real Mac
record → edit → export pass.
A stable Mac consumer release additionally needs Developer ID signing,
notarization and a privacy-permission review. Design Coach/MCP linkage is a
separate workstream.

| Gate | Current evidence |
| --- | --- |
| Windows package identity | The installed `.8` unsigned NSIS package launched with an isolated profile; visible product name, bundled notices and fork update origin checked. The `.9` unsigned NSIS package was built and contains the corrected `dist/wasm/web-demuxer.wasm` path; it is not installed or smoke-tested yet. A fresh local compositor rebuild was blocked by missing `libclang.dll`, so packaging reused the already-validated `.8` binary with a matching SHA-256. |
| Profile continuity | Installed OpenScreen Subscription `.7` created an isolated-profile project with synthetic H.264 media. Studio `.8` reopened its clip, light theme and preferences, then exported a decodable MP4. On the owner's live profile, three project documents and the AI configuration were hash-identical to the verified pre-install backup. The installed `.8` binary separately loaded copies of all three real project documents and opened the editor without outputting their contents; private footage was not exported. |
| Windows native capture | Packaged WGC recorded a generated QA window with microphone, system audio and camera disabled. The saved project reopened and exported a decodable MP4. Control was automated below the OS hit-test. The owner separately confirmed that the installed `.8` HUD opened the source selector, recorded six seconds and stopped with a physical mouse; Studio then opened the new project with its recording. A user-driven export remains unverified. |
| Silent-recording transcription | The owner's `.8` recording contained video but no audio stream. Automatic transcription showed "Failed to fetch" because its WASM URL resolved outside the packaged `dist/wasm` directory. The `.9` source candidate corrects the URL; installed-app behavior has not yet been retested. |
| Installation upgrade | Owner-approved `.8` NSIS upgrade reused the per-user uninstall registration, removed the old executable, installed Studio in a product-named child folder under the previous custom root, and replaced the Start-menu shortcut. The installed app launched with the existing locale. The path transition and updater behavior still need review before publication. |
| macOS | [CI run 36320426373](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36320426373) built Apple Silicon and Intel DMGs from commit `27bc1f5c` with the corrected installation guide. Both passed bundle ID, architecture, native payload, ad-hoc signature, CLI boot and mounted-DMG checks; local SHA-256 values matched the workflow report. Real Mac recording/edit/export, Developer ID signing and notarization remain unverified. |

The source selector failed to list the QA window on the first automated attempt
after it appeared, then found it on retry. Treat that as a transient observation,
not evidence that source discovery is reliable on every launch.
