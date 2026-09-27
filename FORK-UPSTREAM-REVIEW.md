# Upstream update review — 2026-09-27

This is a dated review of changes in the active
[`getopenscreen/openscreen`](https://github.com/getopenscreen/openscreen) repository
that have not yet been integrated into this fork. It is not a claim that the
changes below have been built or tested in the fork.

## Compared revisions

| Repository | Revision reviewed |
| --- | --- |
| Fork `fork/main` | `1c1f39d7` (`1.10.0-subscription.6`) |
| Upstream latest release | [`v1.13.0`](https://github.com/getopenscreen/openscreen/releases/tag/v1.13.0), 2026-09-24 |
| Upstream `main` | `0c749073`, fetched 2026-09-27 |

The branches have diverged: 50 fork-only and 675 upstream-only commits since
their merge base. A `git merge-tree --write-tree fork/main upstream/main` dry run
reported 55 content conflicts, including the fork's AI provider UI/runtime,
Windows and macOS capture helpers, Electron entry points, package metadata,
release workflow, caption schema and locale files. No upstream merge was made.

## Integration priorities

| Priority | Upstream changes to evaluate | Reason and integration note |
| --- | --- | --- |
| P0: before another macOS stable build | [`v1.11.0`](https://github.com/getopenscreen/openscreen/releases/tag/v1.11.0) fixes the macOS 13/14 speech helper failure and missing packaged FFmpeg CLI; [`v1.12.0`](https://github.com/getopenscreen/openscreen/releases/tag/v1.12.0) improves recording-control exclusion and writer/stop recovery. | The fork's current macOS package descends from v1.10.0 and has not received these fixes. Port the related code and packaging together, rebuild native helpers, then perform the Mac record → edit → export checklist on a real Mac. |
| P0: recording/export correctness | `v1.11.0` fixes exports freezing near 80%; `v1.13.0` fixes 9:16 export stretching and microphone mix issues. | Video and audio corruption affects users directly. Review the dependency chain before cherry-picking. Verify native export and audio on both platforms. |
| P0: editor data and transcription | `v1.12.0` fixes background writes that could overwrite a concurrent user edit and a web-demuxer URL that caused transcription to fail with “Failed to fetch.” | Port with the associated state and schema tests; verify that user edits survive background work and that transcription succeeds in the packaged app. |
| P1: security and AI chat | Post-v1.13 [`17d301ed`](https://github.com/getopenscreen/openscreen/commit/17d301ed) limits a loaded document's media grant to trusted directories. [`e5c30879`](https://github.com/getopenscreen/openscreen/commit/e5c30879) and [`7a3b5a88`](https://github.com/getopenscreen/openscreen/commit/7a3b5a88) fix AI message selection/copying, including Windows clipboard handling. | The fork has its own AI message UI, so adapt these fixes to its components and IPC instead of taking the upstream files wholesale. Review the media grant promptly. |
| P1: saved-project CLI export | Post-v1.13 [`76677002`](https://github.com/getopenscreen/openscreen/commit/76677002) fixes CLI export of editor-saved projects. | This touches the document schema, IPC, CLI runner and tests; port as one coherent change if the fork exposes this flow. |
| P2: UX/features | v1.13 adds device-frame and 3D editing features; later `main` adds an Apple system picker, first-run permission flow, VAD and further editor refinements. | Decide which features fit the fork, then integrate in small groups after the correctness fixes. They carry larger UI/schema and native-testing costs. |

Windows UTF-16 capture-path handling in upstream `v1.12.0` overlaps the fork's
existing Korean/non-ASCII path repair. Compare the implementations and tests
before porting it; duplicate patches to `wgc-capture/src/main.cpp` could undo
the fork's current fix.

## Recommended sequence

1. Keep the GPT-6 catalog change separate from upstream synchronization so its
   provider behavior can be reviewed and released independently.
2. Backport the security and high-impact recording/export fixes in focused PRs,
   identifying prerequisite commits with `git show` and adding regression tests.
3. Rebuild all relevant native helpers, run application and test TypeScript
   checks, unit tests, i18n/Biome, then manually validate Windows and macOS
   recording, captions and export. A green renderer test cannot validate native
   packages.
4. Re-evaluate a full merge after these fixes. The 55-conflict dry run makes a
   one-step merge and immediate release too risky for the fork's current code.
