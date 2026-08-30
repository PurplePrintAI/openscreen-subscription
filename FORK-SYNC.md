# Fork sync baseline — 2026-08-30

This branch is an isolated porting workspace for moving the independently
maintained subscription fork onto current upstream `main`. It is not a release
branch and must not be used for installers or update metadata.

## Baselines

- Upstream: `getopenscreen/openscreen` `main` at
  `1c66ca34f888469bf5dd5311e466f490a8694bc0`.
- Published fork prerelease: `v1.10.0-subscription.5` at
  `354a469bb7b1a32294124a40803953f176787fa7`.
- Shared merge base: `2852816a5611d494eb4d15a4950b0bf310e40fff`.
- At branch creation, the comparison contained 90 upstream-only commits and 47
  fork-only commits.

Upstream `main` is not a descendant of the v1.10.0 release tag: the stable tag
was cut on a release branch. Do not merge or rebase the published fork branch
directly onto `main`; that would mix two release lines and make conflict outcomes
hard to audit.

## Ported first

- `2418e85b` ports the standalone Windows Unicode argument fix from fork commit
  `41c41c1d`. Upstream still used ANSI `main(int, char**)`; the port changes the
  WGC helper to wide-character `wmain`, converts arguments to UTF-8 internally,
  and retains the Unicode-path native test.

## Planned selective port order

1. **ChatGPT subscription runtime** — port `4b799eb8` without fork packaging.
   Reconcile against current upstream provider and editor-tool contracts first.
2. **Chat UI and context reference** — port the behavioral parts of `98c12507`;
   keep current upstream component structure and avoid wholesale file replacement.
3. **Claude local runtime** — port `5940d992`, then catalog metadata from
   `193a91d1`. Preserve the user-owned CLI authentication boundary.
4. **Verified context windows** — port `bbb8f69e` only after both runtime catalogs
   are stable on the new base.
5. **Fork distribution** — reapply `ea0781bb`, `e885eafe`, `a8031a94` and
   `05ba6254` last. Release version bumps are recreated rather than cherry-picked.

The dependency/Nix fixes from `.5` must be recalculated against the final merged
lockfile; their old hashes are not portable across this baseline.

## Gates before merging into `fork/main`

- App and test TypeScript checks.
- Full unit suite, i18n, docs and Biome.
- Unicode WGC native capture and package native-hash validation.
- Isolated Codex and Claude catalog/status checks with zero inference prompts.
- Packaged context UI and complete MP4 export/decode.
- A PR into protected `fork/main`; no direct release or tag from this branch.
