# Scene revision and recheck validation — 2026-10-14

## Scope and isolation

Worktree: `D:/dev/openscreen-studio-scene-review`, branch
`feat/studio-scene-review`, based on `e787ad6c9b61610347827ec377dae64873ef3730`.
The preceding narration-tone worktree's 94 changed files were copied with SHA-256
verification and preserved under `D:/purpleprint-build/studio-scene-review-20261014/baseline`.
This is an uncommitted development candidate, not a release or installed update.

The owner launched the isolated QA shortcut and opened Studio. Computer Use
selected the Electron window only after confirming its QA file URL and project
title, `장면 수정·재검수 QA`. When that virtual desktop was unavailable, input
stopped and the session was reset; the owner returned to the QA desktop before
validation resumed. No other application was manipulated.

The fixture uses the existing 19-second, three-scene PurplePrint recording and
previously generated narration. No new recording, AI/TTS call, model download,
external upload, installed-app update or Claude workspace change was performed.

## Automated checks

- App and test TypeScript configurations pass.
- Vite renderer/main build passes; the QA bundle uses the complete 19-file
  Windows native directory, verified by hash.
- Scoped Biome check and locale consistency check pass.
- One full suite run: **2,370 passed, 1 failed, 5 skipped** across 207 files.
  The failure was the existing compositor-hook scroll regression test asserting
  React `hasFrame` immediately after observing `drawImage`. The test now waits for
  both observations. No compositor-hook production change was made in this stage.
- The subsequent five-file run passes **28/28**: scene-plan, scene-review,
  ScenePlanDialog, SceneAnimaticPreview, and useNativeCompositorView tests.
  This targeted result is not presented as a second all-green full-suite run.

Pure and component tests cover proposal isolation, stale-source rejection,
explicit adoption/discard, safe undo across tabs, invalid ranges, duration ripple,
caption-only changes, voice-context invalidation, check persistence, report
redaction and selected-scene end-frame clamping.

## Actual Windows GUI observations

1. Opened Korean **영상 기획 → 수정·검수**. The current first scene covered
   output 0–7 seconds. Its native composite at 3 seconds showed the original
   Korean caption and zoom. The picture check button changed to **사용자 확인됨**.
   This was a QA workflow assertion, not owner approval of a production film.
2. Proposed first-scene duration 7 → 8 seconds and caption
   `고객의 문제에서 설계를 시작합니다`. Until adoption, the plan total stayed
   **19 seconds**; save and other tabs were disabled. Before/after cards showed
   source 9–16 versus 9–17 seconds and output 0–7 versus 0–8 seconds.
3. Switched between native before/after previews and sought to 3 seconds.
   The rendered captions matched the corresponding versions. Seeking the after
   preview to 8 seconds held the selected scene, without displaying scene two.
4. Explicit adoption changed the plan to **20 seconds** and the previous picture
   check to **재검수 필요**. Undo adoption returned to **19 seconds** and the
   matching earlier check became **사용자 확인됨** again.
5. Recreated and adopted the same proposal, saved it, and reloaded the renderer
   through Ctrl+R. Reopening planning restored the new caption, 8-second first
   scene, 20-second total and **재검수 필요**. The old editor timeline still showed
   **19 seconds**. Disk inspection confirmed its three clips remained 0–7,
   7–13 and 13–19 seconds; only the planning snapshot/check metadata changed.
6. Narration checking remained **확인 전**. No claim of listening approval was
   made, and no automatic check was granted by rendering or adoption.

After these observations the QA application's own close signal was issued, its
log confirmed `before-quit / will-quit / quit`, and the process check found zero
matching QA Electron/Python processes. Computer Use was reset immediately and
the shortcut was removed only after checking that it targeted this QA folder.

## Evidence and limits

Local build/test/native-copy logs, initial and saved QA project documents and
machine-readable verification are under
`D:/purpleprint-build/studio-scene-review-20261014`.

- The GUI pass verified renderer reload, not a full process restart.
- It did not create/export a new assembled MP4. Prior scene/animatic export
  evidence remains separate and is not counted as this revision's export test.
- Duration ripple and voice invalidation were exercised by automated tests;
  the GUI check covered first-scene picture invalidation and undo.
- Private review keys compare registered metadata, not changing file bytes at
  the same path, and are not signed evidence of who reviewed the film.
- Final MP4 review stays pending. Source audio is not certified by the optional
  reused-narration check. Mac, release packaging and installation remain untested
  for this candidate.
- Checking a picture currently resets its open preview to the scene start;
  this is a small interaction refinement for a later pass, not a save failure.

Next implementation stage: natural-language production requests should propose
a reviewable scene plan using this acceptance boundary. Capture, generation,
publication and overwriting existing edits must not happen merely because a
proposal was generated.
