# Studio integration review and isolated QA — 2026-10-14

Historical preparation record. Its **not launched** and **manual checks pending**
statuses were superseded by [automated QA](automated-studio-qa-2026-10-14.md), then
[CI package QA](ci-package-studio-qa-2026-10-14.md). Keep the original scope/results
below as history, not as the current task status.

Scope: feature-focused local review, dependency-ordered commits, and a local
developer QA folder. No installer replacement, remote push/PR/release, Claude
workspace changes, additional provider calls, voice generation, browser driving
or Computer Use. The QA app is prepared but **not launched**.

## Review coverage and findings

This is a targeted review of execution, persistence, cancellation, consent and
source-preservation boundaries, not a claim of exhaustive security certification.

| Area | Reviewed boundaries | Outcome |
| --- | --- | --- |
| Product capture | HTTPS/explicit localhost, ephemeral browser session, blocked permissions/downloads/popups, observed heading/tab targets, bounded recording, new document creation | Fixed commit/cancellation race and final-persistence lock below. Capture remains public-page-only, sampled up to 12fps. |
| HyperFrames | Pinned external runtime, explicit local paths, fixed escaped template, registered source assets, bounded child process, output probing, new project import | External runtime is not bundled; no arbitrary renderer-provided HTML/scripts/executables. Windows template/font limitation remains. |
| Narration | Speaker consent, local reference picker, offline Python worker, bounded jobs, B/A/neutral instructions, actual audition before apply, saved audio/mix | No automatic model download. CUDA and configured local models are still required. Clone delivery does not expose preset A/B control. |
| Scene plans | Strict schema, frame quantization, registered media bounds, new project identity, caption/zoom anchors | Original timeline is preserved. Short scenes can omit an inapplicable zoom and report it. |
| Animatic/review | Private native view, bounded/coalesced seeks, audio clock/cleanup, stale revision protection, explicit adoption/undo | Metadata checks are not file-byte verification or final export approval. |
| AI planning | Exact disclosed payload projection, opt-in transcripts, no media/path/voice upload, cancellation/timeout/stale guards, explicit adoption | No vision capability or persistent proposal history is claimed. No live AI call made in this review. |
| Shared integration | Preload/IPC/types/menu, source project saving, legacy metadata, complete native runtime staging | Shared renderer trust check moved out of the product-capture feature to avoid loading it from unrelated services. |
| MP4 output | Constant-rate final packet duration and existing native evidence | Windows fix retained. GUI/macOS/new-PC verification is still a separate release gate. |

### Corrected defects

1. **Late cancellation after draft save:** product capture used to check the
   abort signal after `saveDocument` succeeded, incorrectly reporting cancellation
   and hiding the already-created project ID. The check now precedes save; a
   successful save is the commit point. The regression failed before the fix and
   passes afterward.
2. **New job during final status write:** product capture released its active lock
   before awaiting final persistence. Another plan could replace shared state
   while the old request was finishing. Final status persistence now retains the
   lock and releases the controller in `finally`. A deferred-write test covers it.
   A status-write failure is reported without turning a saved draft into an
   apparently discarded project.

## Commit organization

Dependency order (feature services are not exposed in the UI until the integration
commit):

1. Bounded product capture services and common renderer trust helper.
2. HyperFrames runtime/render services.
3. Local narration, tone controls and export-mix foundations.
4. Scene-sheet, review and animatic foundations, including native view support.
5. Consent-based AI scene-planning service and contracts.
6. Shared UI, preload/IPC registration, menus, narration playback and packaging.
7. Windows MP4 duration fix and native timing regressions.
8. Isolated QA preparation, architecture/validation records and this review.

Intermediate cumulative trees are checked outside the worktree, using only their
committed file set, so later unstaged files cannot hide missing dependencies.
App and test TypeScript configurations are checked for each of the first six
stages. Full unit tests and final production build validate the combined tree.
Logs, baseline hashes and commit IDs live under
`D:/purpleprint-build/studio-integration-qa-20261014`.

Combined-tree checks: 211 Vitest files, **2,391 tests passed and 5 skipped**;
6 Python worker validation tests; 137 native library unit tests; renderer/main
production build; documentation and i18n checks. Scoped Biome has no errors;
two existing dependency warnings in `useNativeCompositorView` remain (the view
is keyed by source path, not the caller's per-render options object). No unsafe
auto-fix was applied. Native addon release rebuild matches the previously
validated SHA-256 `735e72cbdff68929702f5b11bcd4346b97ba8d89be2f63c20dc2a630487ddafc`.

## QA preparation contract

`scripts/prepare-isolated-studio-qa.mjs` requires a new output directory, already
built renderer/main bundles and the complete Windows native directory. It copies
and hashes the build, creates a fresh profile and a local dependency junction,
and writes manual launch/stop scripts. It never invokes Electron itself.

Only optional explicit narration runtime paths and an external HyperFrames runtime
directory are configured. Existing app profiles, provider credentials, conversations
and personal voice recordings are not copied. The QA fixture uses a separate copy
of the approved source recording and a new project ID. This developer folder is
not a redistributable or self-contained installer.

`Stop-QA.cmd` asks this QA app to quit gracefully. It is not a Computer Use session
termination mechanism. This task starts neither the app nor Computer Use.

## Manual checks pending (owner)

1. Launch the new QA from the current desktop; open Studio and the named QA project.
2. Open **Film plan**: verify the saved three-scene sheet, total 19 seconds and
   animatic captions/cut transitions. Source and assembled draft stay separate.
3. Propose a one-second scene extension, compare, accept/undo, save, then assemble
   a new draft. Output duration follows the accepted plan, not the original 19 seconds.
4. In **Narration**, generate a short preset B take, listen, apply; repeat with A
   or a short extra direction. Changing delivery must require a new audition.
   Voice cloning is optional and requires selecting a local consenting reference;
   none is supplied in the QA folder.
5. Export 1080p H.264 MP4 from the intended draft, then check picture, captions,
   audio offset, last frame and expected duration. Automated native timing tests
   do not replace this GUI pass.
6. Quit from the tray or Stop-QA, reopen manually and verify plan/narration/project
   restoration. AI planning can be checked for payload disclosure without sending
   a request. The fresh QA profile intentionally contains no provider login.

Known release gates: actual GUI pass, clean/new-PC runtime setup, bundled runtime
licensing/setup UX, signed installer and update checks, macOS support. None is
implied complete by the local QA build.
