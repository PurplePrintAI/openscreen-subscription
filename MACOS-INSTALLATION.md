# OpenScreen Subscription on macOS

OpenScreen Subscription is an unofficial fork. The current macOS packages are
validation prereleases with the fork bundle identifier and an ad-hoc hardened-runtime
signature. They are **not notarized by Apple**.

## Choose the package

- **Apple Silicon**: M1, M2, M3, M4 or newer Apple chips (`arm64`).
- **Intel**: Macs whose processor is shown as Intel (`x64`).

Open **Apple menu → About This Mac** if the architecture is uncertain. Do not install
the Intel package on Apple Silicon merely because Rosetta can start it; recording,
preview and export would all run through translation.

## Install and open

1. Download the matching `.dmg` from this fork's GitHub prerelease.
2. Open the DMG and drag **OpenScreen Subscription** to **Applications**.
3. In Applications, Control-click **OpenScreen Subscription**, choose **Open**, and
   confirm the first launch. This is the per-app Gatekeeper path for an unnotarized
   validation build. Do not disable Gatekeeper globally.
4. Grant only the permissions needed for the features you use. macOS may request
   Screen & System Audio Recording, Accessibility, Microphone or Camera access.
5. Fully quit and reopen the app after changing a privacy permission.

Because the app uses the fork's own bundle identifier
`io.github.purpleprintai.openscreen-subscription`, its privacy grants are separate
from the official OpenScreen app.

## Local AI runtimes

Codex CLI and Claude Code are optional external dependencies. They are never bundled
in the DMG.

- ChatGPT subscription: install the official Codex CLI, then connect the account in
  OpenScreen's AI settings.
- Claude subscription: install the official Claude Code CLI and run
  `claude auth login` in Terminal before checking the connection in OpenScreen.

The packaged app checks the inherited PATH and common Finder-safe locations:
`~/.local/bin`, `~/.npm-global/bin`, `~/.volta/bin`, `~/Library/pnpm`,
`/opt/homebrew/bin` and `/usr/local/bin`. The corresponding command should work in
Terminal (`codex --version` or `claude --version`) before troubleshooting OpenScreen.

## Validation boundary

GitHub Actions verifies both architectures, the ScreenCaptureKit helper, Metal
compositor, speech runtime, bundle identity, code-signature structure, packaged CLI
boot and a mountable DMG. A real Mac user must still verify the operating-system
permission prompts and a record → edit → export pass before this build is promoted
beyond prerelease status.

Report failures at
[PurplePrintAI/openscreen-subscription issues](https://github.com/PurplePrintAI/openscreen-subscription/issues)
with the Mac model, macOS version, package architecture and a diagnostic export. Do
not include account tokens, CLI credential files or private recording contents.
