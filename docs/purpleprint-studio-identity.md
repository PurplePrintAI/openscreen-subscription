# PurplePrint Studio identity

Status: worktree implementation and locally tested unsigned Windows package;
no Studio release has been published or installed.

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

Before publishing a Studio installer: validate the in-place installation and
existing-user project/settings continuity; confirm new icons, app/menu/shortcut
names and update origin; run Windows and Mac record → edit → export checks. A
stable Mac consumer release additionally needs signing/notarization and a privacy
permission review. Design Coach/MCP linkage is a separate workstream.

| Gate | Current evidence |
| --- | --- |
| Windows package identity | Local unsigned NSIS package launched with an isolated profile; visible product name, bundled notices and fork update origin checked. |
| Profile continuity | Installed OpenScreen Subscription `.7` created an isolated-profile project with synthetic H.264 media. Studio reopened its clip, light theme and preferences, then exported a decodable MP4. The real user profile was not read or changed. |
| Windows native capture | Packaged WGC recorded a generated QA window with microphone, system audio and camera disabled. The saved project reopened and exported a decodable MP4. Control was automated below the OS hit-test, so physical HUD mouse reachability remains unverified. |
| Installation upgrade | Pending: the existing installed copy was not replaced. Version `.8` is a local candidate, not an approved release. |
| macOS | [CI run 36320426373](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36320426373) built Apple Silicon and Intel DMGs from commit `27bc1f5c` with the corrected installation guide. Both passed bundle ID, architecture, native payload, ad-hoc signature, CLI boot and mounted-DMG checks; local SHA-256 values matched the workflow report. Real Mac recording/edit/export, Developer ID signing and notarization remain unverified. |

The source selector failed to list the QA window on the first automated attempt
after it appeared, then found it on retry. Treat that as a transient observation,
not evidence that source discovery is reliable on every launch.
