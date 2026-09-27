# PurplePrint Studio fork changelog

This file tracks changes made by the unofficial
[PurplePrintAI/openscreen-subscription](https://github.com/PurplePrintAI/openscreen-subscription)
fork. The comparison baseline is the active upstream project
[`getopenscreen/openscreen` v1.10.0](https://github.com/getopenscreen/openscreen/tree/v1.10.0)
at commit `dbdadb7d27fe3287d994fb741d6f264a31066648`.

The older `siddharthvaddem/openscreen` repository was archived at v1.5.0 and is
continued by `getopenscreen/openscreen`. Therefore, this log describes only this
fork's additions to upstream v1.10.0; it is not a history of every upstream
improvement since v1.5.0.

For architecture, security boundaries, attribution and the publication process,
see [FORK.md](FORK.md).

For the dated review of newer upstream changes, see
[FORK-UPSTREAM-REVIEW.md](FORK-UPSTREAM-REVIEW.md).

## Unreleased — PurplePrint Studio identity (`1.10.0-subscription.8` candidate)

- Adopts the PurplePrint GraphOS family's neutral surfaces, restrained violet
  accents, typography hierarchy and product mark across the editor and capture
  entry surfaces. Recording and semantic status colors retain their meanings.
- Renames visible app, installer, Start menu and macOS package labels to
  PurplePrint Studio. The technical app ID, data profile, `.openscreen` format,
  CLI command and GitHub update origin stay stable for compatibility.
- Keeps upstream attribution explicit. This work does not add Design Coach/MCP
  integration or claim GraphOS runtime integration.
- A local unsigned Windows NSIS package has been built and smoke-tested with an
  isolated profile. Packaged H.264 import, editor launch and MP4 export passed
  with synthetic media; no existing user data or installation was changed.
- An isolated profile created by the installed `.7` fork retained its project,
  media clip, light theme and preferences when opened by the Studio package;
  the old project exported a decodable MP4. A packaged Windows WGC window
  capture of a generated, non-user-content target also reopened and exported.
  This exercised native capture with automated control, not the physical HUD
  click-through path or an in-place installer upgrade.
- Builds Apple Silicon and Intel macOS DMGs in
  [the fork's validation workflow](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36317659063).
  Both passed architecture, native payload, bundle ID, ad-hoc signature, CLI
  boot and mounted-DMG checks. A real Mac record → edit → export pass, Developer
  ID signing and notarization remain release gates. No Studio release has been
  published.
- Advances the unpublished candidate to `1.10.0-subscription.8`, refreshes the
  Nix dependency hash and checks the rebranded CLI banner in macOS packaging.

## 1.10.0-subscription.7 — 2026-09-27

### GPT-6 model catalog

- Adds GPT-6 Sol, Astra and Luna to the preferred OpenAI model catalog, using
  each model's published 1,050,000-token context window where the active
  runtime does not provide a more specific value.
- Adds a GPT-6 catalog entry only when the connected Codex CLI or OpenAI API
  actually returns that ID. The OpenAI API default proposes Sol, but does not
  imply that a given API key can use it.
- Uses the Responses API for GPT-6 API calls and limits reasoning choices to
  those supported by the selected model; existing Astra settings without a
  valid effort fall back to Low.
- The local Codex CLI was updated to 0.157.1 for validation. Its live
  `model/list` response exposed all three GPT-6 models; this is not a guarantee
  that every user's subscription exposes them.
- The existing effort selector still tops out at Extra high; the official
  GPT-6 `max` effort is not exposed by this catalog update.

### Release and maintenance

- Refreshes the Tiptap editor packages, Electron 41 runtime, Vitest and affected
  transitive dependencies. A clean install and npm audit report zero known
  advisories at release preparation time.
- Makes the branch-protection-required Nix dependency hash check run on every
  pull request, including changes that do not touch the lockfile.
- Includes the dated upstream review in the fork package alongside this log.
  The upstream fixes identified there are **not** integrated in this version.

## Cumulative differences from upstream v1.10.0

| Area | Fork improvement |
| --- | --- |
| Windows recording | Preserves non-ASCII paths, including Korean user and output directories, through the native WGC capture process. |
| ChatGPT subscription | Routes through a user-installed official Codex CLI `app-server`, using an OpenScreen-owned CLI profile instead of copying credentials or inheriting API keys. |
| Claude subscription | Uses the user's installed, unmodified Claude Code CLI and its externally managed authentication. |
| Claude models | Discovers the current model catalog from the local CLI and shows friendly resolved names, including returned 1M-context variants. |
| GPT-6 models | Prefers Sol, Astra and Luna when available through the connected Codex runtime or OpenAI API, with verified context limits and model-specific reasoning options. |
| AI chat | Aligns user and assistant messages, renders safe Markdown, improves streaming, and exposes time/copy/rewind actions on hover or keyboard focus. |
| Context display | Separates estimated selected history, the user's reference value, and a verified context window for the active provider/model when available. |
| Distribution | Uses a separate app identity, user-data directory, installer name, update origin and release configuration from upstream. |

## 1.10.0-subscription.6 — 2026-08-31

### macOS validation prerelease

- Adds fork-branded DMG builds for both Apple Silicon and Intel Macs, preserving the
  fork bundle identifier, product name, user-data separation and GitHub update origin.
- Verifies the ScreenCaptureKit helper, Metal compositor, speech runtime, executable
  architecture, bundle identity, ad-hoc hardened-runtime signature, packaged CLI boot
  and mounted DMG before collecting release assets.
- Pins speech-runtime staging to an explicit successful producer run. The previous
  release workflow asked `gh run download` to inspect its own still-running job and
  failed before either macOS package could be built.
- Prevents subscription tags and releases from entering the upstream-oriented build
  and Discord announcement paths.

### Local AI compatibility

- Finds Codex CLI and Claude Code when OpenScreen is launched from Finder, whose PATH
  normally omits Homebrew and user package-manager directories.
- Checks `~/.local/bin`, `~/.npm-global/bin`, `~/.volta/bin`, `~/Library/pnpm`,
  `/opt/homebrew/bin` and `/usr/local/bin` without invoking a shell or copying CLI
  credentials.

### Distribution status

- macOS packages remain prerelease-only until a real Mac completes the manual
  record → edit → export checklist.
- The initial packages are ad-hoc signed and not notarized by Apple. Installation and
  privacy-permission guidance is recorded in [MACOS-INSTALLATION.md](MACOS-INSTALLATION.md).
- Local validation passed 2,243 unit tests with 4 skipped across 189 files, both
  application and test TypeScript checks, documentation, i18n and Biome. Biome
  retained 14 pre-existing warnings.

## 1.10.0-subscription.5 — 2026-08-30

### Added and changed

- Shows the selected model's verified context window in the context pill and
  settings dialog when the local runtime reports it or the exact model ID matches
  a current official specification.
- Uses that window as the display denominator while keeping the existing
  user-configured history reference visible and editable.
- Labels whether the value came from the active runtime/context variant or an
  official model specification. Unknown and custom gateway models display
  **Not available** instead of receiving a guessed limit.
- Accounts for Claude `[1m]` selections, `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, and
  gateway behavior. A runtime-reported numeric limit takes priority over the
  maintained specification table.

### Scope

The numerator remains an estimate of the selected conversation history. It does
not include system instructions, tool schemas, project data, reasoning tokens or
the model's response, so the percentage is approximate and never triggers
automatic compaction.

Validation: 2,241 unit tests passed and 4 were skipped across 189 files; app and
test TypeScript checks, 13-locale i18n, documentation and Biome completed
successfully. The live local Codex and Claude catalogs were read without sending
an inference prompt, and an isolated Electron UI pass verified the 1M Sonnet 5
badge and context dialog.

### Distribution status

- Prepared as the fork's first public GitHub prerelease after the owner approved
  publication on 2026-08-30.
- Windows x64 only. The installer remains unsigned and is published with SHA-256
  checksums, package verification and explicit validation limitations.
- GitHub Actions is enabled for `fork/main`, `feat/**` and `release/**` so future
  fork branches do not rely only on local validation.

## 1.10.0-subscription.4 — 2026-08-28

Runtime/package commit: `eabe87b24cb321fe41642011f3f960abee72e9bb`

### Added

- Reads `ModelInfo[]` from the official Claude Code CLI streaming initialize
  response. Catalog discovery sends no user prompt and starts no inference turn.
- Shows friendly Claude model names in AI settings and in the chat model picker.
  The catalog observed during validation included Opus 5 (1M), Sonnet 5, Haiku
  4.5, Fable 5 (1M) and Opus 4.8 (1M).
- Adds **Refresh models** and **Enter model ID** controls.

### Preserved boundaries

- Passes the CLI's original selection value through unchanged. Aliases remain
  aliases, explicit model IDs stay pinned, and `[1m]` suffixes remain intact.
- Keeps a saved custom model when catalog discovery fails. A catalog entry does
  not guarantee account access, remaining quota or subscription-covered usage.
- Does not change the user's configurable context-meter reference when a 1M model
  is selected.

### Validation snapshot

- 2,225 unit tests passed and 4 were skipped across 188 files.
- App and test TypeScript checks, 13-locale i18n checks, documentation checks and
  Biome completed successfully. Biome retained 14 pre-existing warnings.
- The installed Windows build displayed the live catalog, preserved existing app
  data and exported a test project to a fully decodable 1280×720 MP4.

## 1.10.0-subscription.3 — 2026-08-28

Runtime/package commit: `4e58f92cd963ce6b9401dc2a07c4a5376953dcca`

### Added

- Adds **Claude (local)** as a provider backed by the user-installed official
  native Claude Code CLI.
- Reuses the CLI's active, user-owned authentication environment. OpenScreen does
  not copy Claude tokens, implement Claude OAuth, or replace `CLAUDE_CONFIG_DIR`.
- Streams CLI output and exposes only the existing OpenScreen editor tools through
  a loopback-only, bearer-protected, per-turn MCP endpoint.

### Safety and lifecycle

- Disables the CLI's built-in filesystem and shell tools for OpenScreen turns.
- Keeps editor argument validation, project-edit permissions and rewind
  checkpoints on the OpenScreen side.
- Uses ephemeral turns with no Claude session persistence and removes temporary
  MCP/prompt material after each turn.

## 1.10.0-subscription.2 — 2026-08-27

Runtime/package commit: `98c12507c0f57604f551fb131091eca6efe72a6c`

### Added and changed

- Makes the conversation token-meter reference configurable from 1,000 to
  2,000,000 tokens, retaining 80,000 as the compatibility default.
- Aligns user messages to the right and assistant messages to the left, removes
  redundant speaker labels, and reveals timestamps, copy and rewind controls on
  hover or keyboard focus.
- Renders assistant responses with sanitized Markdown and GFM. Raw HTML, remote
  images, local-file links and custom URL protocols remain blocked.
- Coalesces streamed text and reasoning updates per animation frame, replaces the
  live row cleanly at completion, marks interrupted output, and avoids late replies
  crossing into another project.
- Keeps message checkpoints and confirmation before rewind.

### Clarification

The configurable number is a UI/reference budget for estimated selected history.
It does not modify a provider's real context window, the selected history policy,
or manual compaction behavior.

## 1.10.0-subscription.1 — 2026-08-27

Runtime/package commit: `05ba62540d4d94d298b9c43f73ce7dcaba565503`

### Added and fixed

- Changes the Windows native capture helper to use wide-character arguments,
  preserving recording and export paths containing Korean or other non-ASCII text.
- Adds **ChatGPT subscription (Codex)** through the official local Codex CLI
  `app-server` over stdio.
- Gives Codex an OpenScreen-owned profile and explicitly removes inherited OpenAI
  and Codex API keys from subscription-mode child processes.
- Routes the existing validated editor tool set to Codex while retaining project
  permissions and checkpoints.

### Fork distribution separation

- Introduces a distinct app/product identity, installation directory, user-data
  directory, installer name and GitHub update origin.
- Adds a fork-specific Windows build configuration and staged dependency checks.
- Retains upstream licenses and third-party notices and documents the publication
  gates in [FORK.md](FORK.md).

## Publication status

- Source branches and commits may be published in this fork repository.
- No entry in this file means an upstream pull request was accepted or endorsed.
- No installer is a GitHub Release unless it appears on this fork's Releases page.
- Local Windows installers described above are unsigned unless explicitly stated
  otherwise in their release notes.
