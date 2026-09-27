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

Before publishing a Studio installer: validate existing-user project/settings
continuity; confirm new icons, app/menu/shortcut names and update origin in the
actual package; run Windows and Mac record → edit → export checks. The Mac build
requires its own signing/notarization and permission review before it can be
called a stable consumer release. Design Coach/MCP linkage is a separate gate.

The local Windows package passed an isolated-profile launch and synthetic H.264
import → MP4 export smoke test. Package metadata and update origin were checked,
but an installed-app upgrade and real screen recording have not been exercised.
