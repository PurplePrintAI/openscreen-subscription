# PurplePrint Studio identity

Status: unsigned `.11` Windows preview validated on the owner's PC. The owner
confirmed recording, MP4 export and an "up to date" check in the installed app.
The `.11` distribution is Windows-only.

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

The `.11` clean Windows package and owner-driven recording → MP4 export passed
from the product-named installation directory. Its manual update check reports
"up to date"; a real future-version updater download/install cannot be tested
until a newer release exists. Public release notes must disclose that the Windows
installer is unsigned.
A separate macOS release still needs a real Mac record → edit → export pass.
A stable Mac consumer release additionally needs Developer ID signing,
notarization and a privacy-permission review. Design Coach/MCP linkage is a
separate workstream.

| Gate | Current evidence |
| --- | --- |
| Windows package identity | The `.11` unsigned NSIS package was built cleanly on a Windows CI runner with libclang. Owner-approved installation reused the existing per-user location without another nested folder. Uninstall registration and installed ASAR report `.11`; the Start-menu shortcut points to the installed executable. Seven installed speech runtime files match the fork-pinned manifest. |
| Profile continuity | Installed OpenScreen Subscription `.7` created an isolated-profile project with synthetic H.264 media. Studio `.8` reopened its clip, light theme and preferences, then exported a decodable MP4. On the owner's live profile, three project documents and the AI configuration were hash-identical to the verified pre-install backup. The installed `.8` binary separately loaded copies of all three real project documents and opened the editor without outputting their contents; private footage was not exported. |
| Windows native capture | Packaged WGC recorded a generated QA window with microphone, system audio and camera disabled. The saved project reopened and exported a decodable MP4. Control was automated below the OS hit-test. Installed `.8` and `.9` were also recorded by the owner with a physical mouse; `.9` exported MP4 successfully. On installed `.10`, the owner reported that the first attempt showed "already running" after clicking Record again while the native helper had not acknowledged startup; retrying recorded and exported MP4. `.11` blocks this overlap and shows "Starting…" while the helper starts. The owner reported a successful `.11` test recording and MP4 export; visibility of the brief starting label was not separately confirmed. |
| Silent-recording transcription | The `.8` recording contained video but no audio stream. Automatic transcription showed "Failed to fetch" because its WASM URL resolved outside packaged `dist/wasm`. Installed `.9` corrected the URL: another video-only recording produced no error toast, and its saved asset carries the expected `no-audio` verdict. |
| Installation upgrade | Owner-approved `.8` NSIS upgrade reused the per-user uninstall registration and created a product-named child folder under the previous custom root. Subsequent `.9`, `.10` and `.11` upgrades reused that exact folder. Before `.11`, the `.10` installed directory and rollback installer were verified, but the copied profile was the obsolete `openscreen` directory rather than Studio's active `openscreen-subscription` profile. The pre-`.11` active-profile hash-continuity claim is withdrawn. All 19 checked critical files from the earlier verified pre-`.10` active-profile backup remain present (18 hash-identical; one now differs, with timing and cause unknown). A post-`.11` backup verified 5,628 active-profile files and 29 critical hashes. `.10` fixed release discovery for the fork's `subscription` prereleases; installed `.11` reports "up to date". A real future-version updater download/install remains unverified. |
| macOS | [CI run 36358715037](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36358715037) built `.9` Apple Silicon and Intel DMGs from commit `f81a8b9d`. Both passed bundle ID, architecture, native payload, ad-hoc signature structure, CLI boot and mounted-DMG checks; downloaded SHA-256 values matched the workflow report. Real Mac recording/edit/export, Developer ID signing and notarization remain unverified. |

The source selector failed to list the QA window on the first automated attempt
after it appeared, then found it on retry. Treat that as a transient observation,
not evidence that source discovery is reliable on every launch.
