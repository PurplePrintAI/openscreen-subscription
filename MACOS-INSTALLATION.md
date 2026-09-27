# PurplePrint Studio on macOS

> This guide covers PurplePrint Studio validation builds, including the
> unpublished `1.10.0-subscription.8` candidate. It is not a stable consumer release.

PurplePrint Studio is an unofficial OpenScreen fork. The current macOS packages
carry the fork bundle identifier and an ad-hoc hardened-runtime signature. They
are **not Developer ID signed or notarized by Apple**. Apple warns that running
software without those checks may put the Mac and its data at risk; use these
packages only for controlled testing from a source you trust.

## Choose the package

- **Apple Silicon**: M1, M2, M3, M4 or newer Apple chips (`arm64`).
- **Intel**: Macs whose processor is shown as Intel (`x64`).

Open **Apple menu → About This Mac** if the architecture is uncertain. Do not install
the Intel package on Apple Silicon merely because Rosetta can start it; recording,
preview and export would all run through translation.

## Install and open

1. Obtain the matching `.dmg` from the fork's validation workflow or an approved
   prerelease. Compare its SHA-256 with the accompanying `SHA256SUMS-macOS.txt`.
2. Open the DMG and drag **PurplePrint Studio** to **Applications**.
3. Try opening **PurplePrint Studio** from Applications. If macOS blocks it and
   you independently decide to test this unnotarized build despite the warning,
   use Apple's [Privacy & Security → Open Anyway procedure](https://support.apple.com/en-au/102445)
   after that attempt. Do not disable Gatekeeper globally or remove quarantine
   attributes by command line.
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
  Studio's AI settings.
- Claude subscription: install the official Claude Code CLI and run
  `claude auth login` in Terminal before checking the connection in Studio.

The packaged app checks the inherited PATH and common Finder-safe locations:
`~/.local/bin`, `~/.npm-global/bin`, `~/.volta/bin`, `~/Library/pnpm`,
`/opt/homebrew/bin` and `/usr/local/bin`. The corresponding command should work in
Terminal (`codex --version` or `claude --version`) before troubleshooting Studio.

## Known transcription limitation

This fork still uses the upstream v1.10.0 speech-helper code. On macOS 13 and 14,
the helper may fail to load and the captions pane can report **Failed to fetch**.
Upstream fixed this in
[v1.11.0](https://github.com/getopenscreen/openscreen/releases/tag/v1.11.0),
but that fix has not yet been backported to this fork. If transcription is
essential on those macOS versions, wait for a build that includes the fix.

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
