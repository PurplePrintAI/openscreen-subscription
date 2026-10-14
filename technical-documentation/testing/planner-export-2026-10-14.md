# AI plan → separate draft → MP4 — 2026-10-14

## Correction: Computer Use session was not verified as ended

The owner subsequently reported having to stop Computer Use manually after our
passes. The recorded QA process exit and `node_repl.js_reset` establish only app
shutdown and JavaScript-runtime reset. They do not establish termination of the
Windows Computer Use control session. Earlier completion wording overstated
the evidence. The owner's manual-stop report supersedes that wording; no
desktop control was restarted while investigating this correction.

## Result

Actual Windows GUI assembly and MP4 export succeeded. The output fully decodes,
contains all 570 frames at 30fps timestamps, and the checked Korean captions
match the accepted plan. **One existing video-stream duration metadata warning
remains**; this is a qualified verification, not a release promotion.

## Isolation

The previously accepted Opus 5.5 plan was copied into a fresh QA profile at
`D:/purpleprint-build/studio-planner-export-20261014/qa-app`. Its source project
ID is `qa_planner_export_source`, title `AI 기획 조립·내보내기 QA`.
149 build/native files were copied and checked by SHA-256. No AI configuration,
credentials or voice files were copied. No additional model call was made.

The owner launched the desktop shortcut and opened Studio on the current
desktop. Computer Use verified the exact QA editor URL/project. The installed
application, real profiles, Claude work and previous QA source were not edited.

## Observed desktop flow

1. Opened **Film plan · Scene sheet**, confirming the saved title
   `하나의 아이디어가 사용자 흐름이 되기까지`, three scenes, 19 seconds and 570
   planning frames. No plan edits were made.
2. Clicked **Assemble new draft**. Studio opened a separately saved project:
   `proj_d4c8185c-404d-4752-9dc2-46b4c41797db`. Its clips end at 7, 13 and 19
   seconds, with three text annotations and zero zoom regions, matching the AI
   proposal. The original QA source file remained byte-identical.
3. Opened Export, retained MP4/1080p/H.264 and selected **30fps**. Saved through
   the real native file dialog to
   `D:/purpleprint-build/studio-planner-export-20261014/ai-plan-19s-1080p.mp4`.
   The actual app displayed **Saved to** that path.
4. Immediately after GUI completion, signaled only this QA app to quit, reset
   Computer Use, checked zero matching QA processes and removed only the owned
   shortcut after verifying its exact target arguments. Quit lifecycle events
   are present in the QA log. Subsequent checks used files without desktop input.

## Output measurements

| Check | Actual result |
| --- | --- |
| Container duration | 19.000000 seconds |
| Codec / dimensions | H.264 / 1920 × 1080 |
| Nominal frame rate / decoded frames | 30fps / 570 |
| Frame timestamps | Every PTS matches `index / 30` within 0.00001 seconds |
| Last decoded frame | PTS 18.966667 + duration 0.033333 = 19.000000 seconds |
| Decode check | `ffmpeg -v error -xerror … -f null -` exits 0 |
| Audio | Silent AAC track; decoded sample peak 0.0, no narration/music requested |
| File size | 3,814,596 bytes |
| SHA-256 | `ee4aafb1c6e29728b2da0aef19ec9e3634a9142da90097248ebcaccb96634003` |

Full-resolution exported frames at 3, 10 and 16 seconds were visually inspected.
Each showed the corresponding new Korean caption, without observed clipping,
over the selected product recording. This verifies sampled output composition;
it does not certify the film's full narrative quality or semantically align every
caption with every visible action.

Structural checks compare all three source intervals (9–16, 42–48, 64–70),
timeline positions and clip-anchored caption text/timing with the accepted plan.
The previous source project, the fresh QA source copy and original recording
retain their baseline hashes.

## Duration metadata warning — follow-up required

`ffprobe` reports video-stream duration **18.966667**, one frame less than the
container duration, and `avg_frame_rate=17100/569` instead of 30. The 570 frame
timestamps and decoded frame durations still cover the full 19 seconds. The
output has not been remuxed or otherwise repaired to conceal this discrepancy.

The previous `Studio-scenes-19s-1080p.mp4` has the identical 30fps discrepancy.
The earlier 60fps `preset-gui.mp4` similarly reports video duration 18.983333 and
1140 frames. This evidence suggests an existing export/mux metadata issue,
not a new AI-planning regression; the exact native cause is not established.
Fix and verify this before claiming strict export metadata conformance.

## Evidence and remaining limits

All evidence is under `D:/purpleprint-build/studio-planner-export-20261014`:
`baseline.json`, `source-copy-before.openscreen`, `gui-export-complete.txt`,
`export-verification.json`, the actual MP4 and three extracted PNG frames.
`verify-export.py` verifies the actual GUI-created files and does not generate
a substitute video. The saved `.openscreen` draft remains in the isolated profile.

No code/runtime changes were needed for this pass, so the preceding 2,389-test
suite result was not redundantly rerun. macOS, installation/release, voice mixing,
and restart of the newly assembled project were not tested here. QA completion
does not automatically mark any user review status as approved.
