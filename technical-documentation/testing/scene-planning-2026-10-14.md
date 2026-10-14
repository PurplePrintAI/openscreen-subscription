# Scene planning validation

Date: 2026-10-14 (Asia/Seoul). Development-only work on
`feat/studio-scene-sheet`, in `D:/dev/openscreen-studio-scene-sheet`.
No installation, release or Claude worktree change was performed.

## Preserved baseline

The preceding `feat/product-demo-production` checkout was left in place. Its
69 modified/untracked source files (875,116 bytes) were snapshotted with hashes
under `D:/purpleprint-build/studio-scenes-20261014/baseline`, then copied into a
new worktree based on `e787ad6c9b61610347827ec377dae64873ef3730`. No stash,
reset, cleanup or commit was applied to the original checkout.

The final preservation check matched all 69 original file hashes and the exact
original Git status. The source QA project's timeline also remained 18 seconds
after saving its 19-second planning snapshot and assembling a separate draft.

## Automated checks

- Inherited feature baseline: 7 files, 41 tests passed.
- Targeted scene/dialog/write-audit/HyperFrames checks: 5 files, 47 tests passed.
- Full suite: 203 files, 2,341 passed, 5 skipped. Expected negative-fixture logs
  in docs and mocked network tests are not production failures.
- App and test TypeScript configs passed. A test-only unsupported `exact`
  option was removed before the final test-config check.
- Vite renderer/main/preload build passed. Documentation and i18n checks passed.

## Actual Windows interaction

The isolated app is `D:/purpleprint-build/studio-scenes-20261014/qa-app`, with its
own `qa-profile`. It uses the existing Electron runtime and a complete set of 19
native bundle files copied and hash-checked from the preceding isolated narration
QA app. The installed Studio directory and actual user profile were not modified.

The fixture uses previously approved, silent PurplePrint footage, 2546x1434,
with three six-second source windows (9-15, 42-48 and 64-70 seconds). It does not
make a new recording or AI/voice call. The capture's encoded 30fps is not proof
of 30 unique captured frames per second.

Verified with real Computer Use keyboard/mouse input in the Electron editor:

1. Korean planning UI and saved three-scene plan opened.
2. First scene changed from 6 to 7 seconds; the total changed from 18 to 19
   seconds / 570 planning frames. Later scenes moved to 7-13 and 13-19 seconds.
3. Preview displayed all three original video frames, intended captions and
   source/output ranges. The 390px mobile-width scene sheet was inspected.
4. Save persisted the 19-second plan while preserving the original 18-second
   editor timeline. Native Ctrl+Z restored 6 seconds and Ctrl+Shift+Z restored
   7 seconds; both disk results were checked.
5. QA app quit completely and restarted. The reopened planning dialog restored
   the 19-second plan, including the changed range and zoom settings.
6. **Assemble new draft** created a second project. The source project remained.
   The new timeline was 0-7, 7-13 and 13-19 seconds; captions and zooms carried
   the same clip anchors. Playback advanced to the 19-second end.
7. Native GUI export selected 1080p, 30fps and H.264, used the Windows save
   dialog, and displayed the successful saved-file result.

The HUD could not be clicked reliably through Computer Use's click-through
hit-test handling, and a window on another virtual desktop was not targetable.
The owner opened the Studio editor. This is assisted editor QA, **not** a passing
automated HUD or recording test. A physical Escape stop was respected; UI work
resumed only after the owner explicitly requested it.

## Output and inspection

Output: `D:/purpleprint-build/studio-scenes-20261014/Studio-scenes-19s-1080p.mp4`.
Full decode passed. FFprobe reports H.264, 1920x1080, 30/1fps, 570 decoded video
frames and 19.000000 seconds, plus AAC audio. This is a silent-source fixture;
native narration/audio alignment was not revalidated in this run.

The output is 14,579,794 bytes. SHA-256:
`4ee138624e59ab5efb2f2f240a9a0d9af01fa4449e51b0f6e64797d121e76d8a`.
The machine-readable validation and exported project copy are in the same QA
root as `verification.json` and `assembled-19s.openscreen`.

Exported full-resolution frames at 3, 10 and 16 seconds were visually inspected.
They show the respective Korean captions and zoomed source scenes without broken
glyphs or black output. The scene sheet is not a substitute for these export
checks. This QA clip demonstrates assembly, not final marketing direction or
automatic component-fitting spotlights.

The app was quit via its isolated QA lifecycle signal immediately after GUI
verification. Its quit events were logged, no QA Electron processes remained,
and the Computer Use JavaScript kernel was reset. File inspection continued
without a desktop-control session.

## Remaining boundaries

- No installer or public release was produced; no Mac test was performed.
- No new generation, paid submission, authenticated product browsing or upload.
- Planning preview uses source footage; final effects are inspected in the editor.
- No automatic propagation from later manual timeline edits back to the plan.
- One successful export does not close previously observed intermittent native
  startup/export issues or establish broad GPU/device stability.
