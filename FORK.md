# PurplePrint Studio — independent OpenScreen fork

PurplePrint Studio (formerly OpenScreen Subscription) is an **unofficial,
independently maintained fork** of
[getopenscreen/openscreen](https://github.com/getopenscreen/openscreen), initially
based on upstream **v1.10.0** (`dbdadb7d27fe3287d994fb741d6f264a31066648`).
It is not an official OpenScreen release and is not endorsed by the upstream
maintainers or by OpenAI. Upstream copyright notices are retained.

For the concise, version-by-version delta from upstream v1.10.0, see
[FORK-CHANGELOG.md](FORK-CHANGELOG.md). This document retains the detailed
architecture, policy and release notes behind those changes.

## Scope

- Fix Windows recording paths containing non-ASCII characters.
- Add ChatGPT subscription routing through the official local Codex app-server.
- Connect a user-installed, unmodified Claude Code CLI with externally managed authentication.
- Retain API-key providers, editor tool validation and checkpoints.
- Separate installation identity, user data and update downloads from upstream.

The app remains free. The former "Subscription" name described optional use of the
user's own eligible ChatGPT plan; Studio does not sell or require its own plan. Codex CLI
is a user-installed dependency, not bundled in the installer. Tokens, API keys,
user settings, recordings and diagnostic transcripts must never be committed or
uploaded as release assets.

## Policy review (2026-08-27)

Reviewed: upstream [CONTRIBUTING](https://github.com/getopenscreen/openscreen/blob/main/CONTRIBUTING.md),
[MIT LICENSE](https://github.com/getopenscreen/openscreen/blob/main/LICENSE),
[third-party notices](https://github.com/getopenscreen/openscreen/blob/main/THIRD-PARTY-NOTICES.md),
AGENTS.md, and git/build/release documentation. No separate fork-distribution or
trademark policy was found in the reviewed repository documentation. This records
what was checked; it is not a claim of legal clearance or endorsement.

Upstream describes fork → branch → test → commit/push → pull request for
contributing. Independently distributing a fork and submitting an upstream PR
are different actions. Do not represent a PR as accepted without actual review.

## Contributions and separation

1. Preserve upstream history and an `upstream` remote. The initial fork release
   starts from the tested v1.10.0 tag on `release/v1.10.0-subscription.1`.
2. Keep the recording fix, subscription feature and fork packaging in separate
   commits. An upstream proposal should not import fork branding or feed changes.
3. Before an upstream PR, compare current upstream code, rebase the proposal onto
   current upstream `main`, use its PR template and required checks, then request
   maintainer review. Submitting a PR is a separate owner-approved step.
4. Never use upstream Store identities, signing credentials, package-manager
   listings or announcement channels to distribute this fork.

## Windows release procedure

1. Use the Node/npm versions from package.json and run `npm ci`.
2. Build the WGC helper and compositor from this checkout. Keep native-payload
   and freshness checks enabled. Do not bypass them or retimestamp old binaries.
3. Fetch the pinned, checksum-verified LGPL FFmpeg SDK. Stage speech helpers from
   a recorded upstream build; retain provenance and hashes.
4. Run app/test typechecks, relevant tests, the full unit suite, i18n checks and
   native smoke tests. Resolve new failures; never relabel a failed check as passed.
5. Package with `electron-builder.fork.json` and `--publish never`. The original
   upstream configuration is retained for reference, not used for fork releases.
6. Verify the packaged ASAR, native binaries, license/notices, fork identity,
   update origin and actual installed executable.
7. Produce SHA-256 checksums and notes with source commit, inputs, tests,
   unsigned status and limitations. Prepare a draft release before public release.
8. Publish only after recorded checks and the fork owner's approval. An upstream
   PR is not a side effect of packaging this fork.

After staging native dependencies:

```powershell
npm run build-vite
npx electron-builder --win nsis --x64 --config electron-builder.fork.json --config.npmRebuild=false --publish never
```

The installer is unsigned unless an independently authorized signing identity is
configured. No upstream publisher identity is borrowed. Windows security prompts
must be handled by the user, not disabled by this fork or its build scripts.

## macOS prerelease procedure

macOS packages must be built natively on the matching GitHub-hosted architecture:
Apple Silicon on `macos-latest` and Intel on `macos-15-intel`. Cross-packaging an
Intel app from an Apple Silicon runner is not accepted because the capture helper,
FFmpeg and Metal compositor are host-architecture builds.

1. Run **Build whisper-stt binaries** against the release source and retain its
   successful run ID.
2. Dispatch **Build OpenScreen Subscription for macOS** with that exact run ID.
   This prevents a release/tag workflow from racing a still-running dependency build.
3. Package with `electron-builder.fork.json`; never inherit the upstream bundle ID,
   product name or update repository.
4. Require both architecture jobs to verify the native payload, bundle ID, executable
   architecture, code-signature structure, packaged CLI boot and mounted DMG.
5. Publish the combined DMGs, validation JSON and SHA-256 file only as a prerelease
   until a real Mac completes the manual record → edit → export checklist.

Without independently authorized Apple Developer credentials, the workflow applies
an ad-hoc hardened-runtime signature so macOS privacy grants attach to the fork bundle
identifier. This is not Apple notarization. The release notes and
[MACOS-INSTALLATION.md](MACOS-INSTALLATION.md) must retain the Gatekeeper limitation;
never borrow upstream credentials or advise users to disable Gatekeeper globally.

## Attribution and redistribution

Keep `LICENSE` and `THIRD-PARTY-NOTICES.md` in source and installed resources.
Preserve dynamic FFmpeg libraries and their source/build references. Do not swap
the LGPL build for GPL/nonfree variants. Third-party components retain their own
licenses; this document does not replace them.

## Chat UI changes in subscription.2

The context badge opens a configurable **reference**, saved as
`contextBudgetTokens` in the existing AI configuration. It applies across
conversations; valid values are whole numbers from 1,000 to 2,000,000, with an
80,000 default for existing configurations. When the active runtime reports a
context window, or the exact model ID matches a maintained official specification,
the badge and dialog show that model limit separately and use it as the display
denominator. Unknown/custom gateway models keep the reference denominator rather
than receiving a guessed limit.

The numerator estimates selected history text only; it excludes system prompts,
tool schemas, project data, reasoning and output tokens. The displayed percentage
is therefore approximate and changes neither history selection nor manual-only
compaction behavior. The dialog labels whether a context limit came from the
runtime/context variant or an official model specification.

User messages align right; assistant Markdown aligns left. Timestamps, copy and
rewind appear on hover or keyboard focus (always visible on touch devices).
Text and reasoning chunks are coalesced per animation frame; the completed RPC
replaces the live row without a duplicate. Interrupted partial text is marked
incomplete. Late replies from a different project are ignored. Reading older
messages suspends automatic scrolling until the reader returns to the bottom.

Markdown uses `react-markdown` and `remark-gfm`, without raw HTML, remote image
loading, local-file links or custom URL protocols. Original Markdown is copied
to the clipboard. Message checkpoints and the confirmation before rewind remain
in place; the optimistic user ID is replaced by the server checkpoint ID.

The desktop visual smoke test uses an isolated profile and a local deterministic
OpenAI-compatible SSE server, not the user's subscription or real project data.
It is a UI/IPC test, not evidence of a new live subscription inference test.

Fork support: https://github.com/PurplePrintAI/openscreen-subscription/issues

## Claude local runtime (subscription.3 local build, 2026-08-28)

`Claude (local)` runs the user's official native Claude Code executable, version
2.1.238 or later. Install and sign in through the official CLI (`claude auth login`),
then select **Claude (local) → Check CLI connection → Save** in AI settings.
`OPENSCREEN_CLAUDE_EXECUTABLE` may point to an absolute native executable path;
shell wrappers are not accepted. Claude Code is not bundled in this fork.

OpenScreen does not implement Claude OAuth, read/copy credential files, request
setup tokens, or change the CLI's auth profile or authentication environment.
Only sanitized `claude auth status` metadata is returned to the renderer.
Subscription, API-key and other provider authentication are distinguished; actual
billing follows the CLI's active account. Model choices are retrieved from the
official CLI; model access and billing still depend on the account and plan.
Deselecting this provider does not log out the
shared CLI or affect other applications.

The official CLI runs in print mode with JSONL streaming. Built-in filesystem and
shell tools are disabled. Only the current turn's existing OpenScreen editor tools
are exposed through a loopback-only, bearer-protected, ephemeral MCP endpoint.
The CLI keeps its own agent loop; OpenScreen retains argument validation, edit
permission checks and message checkpoints. MCP calls are serialized and duplicate
request IDs cannot repeat edits. No permanent MCP configuration is installed.
Unexpected tool exposure fails closed; administrator-managed CLI policies are not
bypassed. User hooks/skills/Chrome integration are disabled for these calls.

Each request is ephemeral: the existing selected OpenScreen history is replayed,
and `--no-session-persistence` is used. This does not add persistent chat history,
change context-budget semantics, or port GraphOS's session-resume layer. Temporary
prompt/MCP files are removed after a turn. Claude Code may retain its own diagnostic
or account metadata according to its settings; this flag is not a no-logging promise.

### Policy review and publication boundary

Reviewed the current official [CLI terms](https://code.claude.com/docs/en/legal-and-compliance),
[Agent SDK guidance](https://code.claude.com/docs/en/agent-sdk/overview), and
[subscription usage update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).
The CLI terms distinguish users authenticating directly to the unmodified binary
from third-party applications offering their own Claude login or intermediating
credentials. The SDK guidance still requires prior approval for products offering
Claude account login/rate limits. The June 15 billing change is paused; that
announcement is not blanket approval for a third-party authentication product.

This implementation follows the local, user-owned CLI path, not an app-owned
subscription OAuth flow. This is an engineering interpretation, not individualized
Anthropic approval or legal clearance. Public promotion/release of this feature
remains separate and requires owner review of these conditions. No GitHub Release,
upstream PR, or public feature announcement is implied by local validation.

On 2026-08-28 the fork owner requested a local release build for personal testing.
Version `1.10.0-subscription.3` packages this feature with the existing fork app ID,
installation directory and user-data identity. This authorizes local packaging
and installation, not a GitHub release, upstream PR or public announcement.
The user-installed Claude Code binary and its account remain outside the package.

On 2026-08-30 the fork owner approved publishing the accumulated fork work as an
unsigned Windows prerelease. Version `1.10.0-subscription.5` is the first GitHub
prerelease under the fork's own identity and update origin. The approval does not
represent upstream, OpenAI or Anthropic endorsement, does not authorize borrowed
publisher credentials, and does not turn local CLI authentication into an
OpenScreen-managed account service. Release notes must retain the unsigned status,
test scope, external-CLI requirements and known limitations.

### Runtime model catalog

The model picker reads `ModelInfo[]` from the official CLI's streaming control
`initialize` response, the same metadata exposed by the public Agent SDK's
`supportedModels()` method. Discovery sends no user prompt and starts no model
completion. It runs with customizations disabled and no tools, while preserving
the CLI's authentication and managed policy. No subscription credential file or
private model-list endpoint is read by OpenScreen.

Both AI settings and the chat model picker show resolved version names, including
1M variants returned by the CLI. The original selection value is passed through
unchanged: aliases remain aliases, and explicit versions/context suffixes stay
intact. The list is not hardcoded, does not promise remaining quota, and does not
override the configured context-meter reference. Refresh and direct model-ID
entry remain available; errors never silently replace the saved model.

Some models and context options may use usage credits. The UI points this out
rather than promising every selection is covered by the subscription limit.
See the [official model configuration](https://code.claude.com/docs/en/model-config)
and [SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript).
