# Natural-language scene planning — 2026-10-14

## Scope

Branch `feat/studio-scene-planner`, worktree
`D:/dev/openscreen-studio-scene-planner`. The 99 changed files from
`D:/dev/openscreen-studio-scene-review` were backed up and copied with SHA-256
verification. The installed application, existing QA projects and Claude work
were not changed. This is uncommitted development work, not a release.

The new **AI 기획 / AI planning** tab uses a text-only provider request to propose
registered-source scenes. Exact payload inspection, optional transcript excerpts,
explicit transmission consent, strict response validation, native preview and
explicit adoption are connected. Adopting changes only the local planning view;
save/assembly remain distinct actions. The UI does not claim to have viewed the
footage. Missing-material responses do not enable plan adoption.

## Automated checks completed

- Related tests: **38 passed**, six files.
- Full suite, run once with two workers: **211 files passed; 2,389 tests passed,
  5 skipped**. The prior compositor-hook waiting regression also passes here.
- App TypeScript and test TypeScript configurations pass.
- `npm run build-vite` passes (renderer, main process and preload).
- Scoped Biome, locale consistency and documentation link checks pass.
- `git diff --check` passes (Git emits its existing LF/CRLF warning).

Coverage includes private-path exclusion from the model projection, opt-in and
bounded transcript excerpts, invented assets, duration/source limits, unsupported
narration reuse, transcript evidence without a supplied overlap, missing-material
responses, invalid JSON, provider failure, consent and route-change checks,
duplicate requests, timeout/cancel/late result handling, stale project rejection,
preview without application and explicit adoption into the scene sheet. IPC tests
reject non-main-frame/untrusted senders and cover lifecycle cancellation. A model
factory regression verifies zero API retry configuration for planning.

The model replies in these tests are controlled fixtures. These tests verify the
contract and controls, not the quality of a real model's plan.

## Isolated QA and authorized live check

`D:/purpleprint-build/studio-scene-planner-20261014/qa-app` contains the production
build and the complete 19-file Windows native bundle, verified by SHA-256.
The only project is **AI 기획안 QA**, copied from the approved 19-second,
three-scene recording fixture. Narration and old review checks were removed from
this copy, not from their source projects. Its separate config selects Claude
CLI `sonnet`, with ordinary agent edits disabled. No credentials were copied.

The owner launched the shortcut and authorized exactly one live planning call,
changing the requested model from Sonnet to **Opus 5.5**. The actual CLI catalog
displayed Opus 5.5, selected through the QA app's model picker. Its CLI selection
value was `opus` (not a hardcoded/pinned version ID). The saved QA config retained
`allowAgentEdits: false` and medium effort. No authentication UI or tokens were
manipulated, and no additional generation call or retry was submitted.

Actual Windows GUI observations:

1. Verified the QA editor file URL and `AI 기획안 QA` project; switched the QA UI
   to Korean and opened **영상 기획 → AI 기획**.
2. Entered the approved 20-second product-intro brief, referencing the existing
   three source ranges and explicitly distinguishing planning intent from visual
   evidence. The expanded outbound JSON contained no paths/media bytes/voice
   references; `transcripts: []`, `visualEvidence: "none"`, `keepNarration: false`.
3. Checked the disclosure consent and submitted **one** generation request.
   Opus returned a valid 19-second, three-scene proposal, preserving 9–16,
   42–48 and 64–70 source seconds. It supplied a title, three Korean captions,
   per-scene rationale and five missing-evidence notes. It explicitly said the
   footage had not been viewed and omitted the existing zoom because its focus
   could not be justified from the supplied evidence.
4. Before adoption, save/assembly and other planning tabs were disabled. Native
   proposed-animatic frames at 3, 10 and 16 seconds showed the matching new
   captions. Playback advanced from 16 seconds and stopped at 19 seconds.
   A disk hash check confirmed the project was unchanged after generation and
   preview. This is not an aesthetic/semantic approval of a finished film.
5. Clicked **기획안 채택 · 장면 시트로**. The scene sheet opened with the proposed
   title/captions and source ranges; disk hash still matched the original before
   Save. **기획 저장** then persisted the planning snapshot only.
6. Ctrl+R reloaded the renderer. Reopening planning restored the accepted title,
   19-second/570-frame plan and captions. **수정·검수** showed picture **확인 전**
   and **재사용 나레이션 없음**, not automatic approval. The original timeline
   still had its old captions and three 1.5× zooms; structural verification checks
   that these and all other top-level editing data are preserved.
7. Immediately after the screen pass, the QA close signal was issued, logs
   recorded `before-quit / will-quit / quit`, and the process check found zero
   matching QA Electron/Python processes. Computer Use was reset and only this
   QA shortcut was removed after checking its exact target arguments.

This initial pass did not export a new MP4. A subsequent isolated
[assembly/export pass](planner-export-2026-10-14.md) verified the actual output
and recorded an existing duration-metadata warning. No claims are made about
full process restart, Mac, or installed/release validation. Only one actual model response was evaluated;
this is a functional live check, not a broad model-quality evaluation.
Request/rationale history is currently temporary; the accepted plan can be saved.
The provider sees metadata/text, not video frames. Vision, automatic recording,
generation, scene reshooting, publishing and a general chat planning-mode switch
are outside this implementation.

## Local evidence

`D:/purpleprint-build/studio-scene-planner-20261014` contains the baseline manifest,
initial QA document, targeted/full test logs, build log, test type log, native
copy manifest and machine-readable verification. `live-brief.txt`,
`live-proposal-ui.txt` and `restored-plan-ui.txt` capture the actual typed brief
and accessibility observations. `accepted-scene-plan.json` is read back from
the saved QA project, not an invented sample. These local evidence files are not
automatically published or committed.
