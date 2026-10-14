# Narration tone integration QA

2026-10-14 (Asia/Seoul). Owner selected B and authorized its use as the preset
default, A/B selection and user tuning in a separate worktree.

## Preservation

New checkout: `D:/dev/openscreen-studio-narration-tone`, branch
`feat/studio-narration-tone`, base `e787ad6c9b61610347827ec377dae64873ef3730`.
All 92 modified/untracked files (1,015,403 bytes) from the scene-sheet checkout
were snapshotted in `studio-narration-tone-20261014/baseline` and copied by hash.
No stash/reset/commit, installed profile change, release or Claude worktree edit.

## Behavior and automated verification

- B is the new-request default; A and neutral remain selectable.
- Up to 400 characters of extra delivery direction are saved with the take.
- Unsupported/unknown model capabilities and clone style requests are rejected.
- Old audio is not relabeled B, and tone/model metadata round-trips through save.
- Script/tone changes invalidate audition. Apply is gated on actual playing of
  the matching take; a failed play request or media error cannot approve it.
- Full Vitest: 206 files, 2,363 passed, 5 skipped. Python preflight: 6 passed.
  App/test TypeScript, scoped Biome and Vite build passed.

The real `NarrationService` generated B default (9.44s) and A plus custom direction
(8.32s), passed FFmpeg normalization/full decode, verified worker instruction
echoes and stored matching tone/model fields. B's raw WAV is byte-identical to
the owner's selected B sample:
`8534bb07f8d2c2b3c78f65b13757dd1275cf69b571689e272cdc49482bff8359`.
The app retains its existing loudness normalization, so normalized playback level
need not equal the earlier -18 LUFS comparison copy.

The custom instruction asked for slower/clearer delivery, but the result was
8.32s versus the earlier untuned A's 8.40s. This proves the instruction reached
the model, **not** that natural-language pace requests are quantitatively obeyed.
The UI explicitly states that limitation. No speed/pitch slider is claimed.

## Isolated native GUI

The owner opened the dedicated QA shortcut on their desktop.
The editor path was verified under
`D:/purpleprint-build/studio-narration-tone-20261014/qa-app`. Native input reached
the Korean Narration modal and verified:

1. New project defaults to B; switching to A and back works.
2. B plus `과장 없이, 핵심 단어는 또렷하게.` and a short Korean script generated
   a real 3.12s take. The matching tone was displayed beside the audio control.
3. Apply was disabled before playback. Real playback enabled it and the media
   control subsequently reached 3.12s/end.
4. Changing extra direction hid the mismatched take and disabled Apply. Restoring
   the original direction still required another audition.
5. After audition, Apply saved the take at +2s with 40% original gain.
6. A renderer reload and re-entry restored B, exact extra direction, script and
   +2s offset. The persisted JSON records `model: qwen-tts-custom-1.7b` and the
   same tone. This is saved-document/renderer reload verification, not a full
   process-restart claim.

One offscreen accessibility click closed the modal through the backdrop instead
of playing audio. No save occurred. The candidate inputs were re-entered, the
controls scrolled visibly into view, and playback/application were then verified.
This input failure is not counted as a successful play or apply.

The QA app quit immediately after the checks; quit events were logged and zero
owned Electron/Python processes remained. Computer Use was reset and the owned
temporary shortcut removed. This run did not export a new MP4; the unchanged
mix/export path has the earlier A/V record and regression tests. No Mac or
installed-build validation, voice-quality approval for every custom instruction,
or numeric control of generated pace/emotion is claimed.

## Evidence

External QA root: `D:/purpleprint-build/studio-narration-tone-20261014`.
It contains baseline hashes, runtime configuration, service takes/provenance,
test/build logs and a separate `qa-profile`. Model paths point to the approved D:
folders; no model/runtime configuration was written into the installed app.
