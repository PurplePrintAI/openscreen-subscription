# OpenScreen Subscription — independent fork

This is an **unofficial, independently maintained fork** of
[getopenscreen/openscreen](https://github.com/getopenscreen/openscreen), initially
based on upstream **v1.10.0** (`dbdadb7d27fe3287d994fb741d6f264a31066648`).
It is not an official OpenScreen release and is not endorsed by the upstream
maintainers or by OpenAI. Upstream copyright notices are retained.

## Scope

- Fix Windows recording paths containing non-ASCII characters.
- Add ChatGPT subscription routing through the official local Codex app-server.
- Retain API-key providers, editor tool validation and checkpoints.
- Separate installation identity, user data and update downloads from upstream.

The app remains free. "Subscription" names the optional use of the user's own
eligible ChatGPT plan; this fork does not sell or require its own plan. Codex CLI
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

## Attribution and redistribution

Keep `LICENSE` and `THIRD-PARTY-NOTICES.md` in source and installed resources.
Preserve dynamic FFmpeg libraries and their source/build references. Do not swap
the LGPL build for GPL/nonfree variants. Third-party components retain their own
licenses; this document does not replace them.

Fork support: https://github.com/PurplePrintAI/openscreen-subscription/issues
