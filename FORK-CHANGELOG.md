# PurplePrint Studio fork changelog

This file tracks changes made by the unofficial
[PurplePrintAI/openscreen-subscription](https://github.com/PurplePrintAI/openscreen-subscription)
fork. The comparison baseline is the active upstream project
[`getopenscreen/openscreen` v1.10.0](https://github.com/getopenscreen/openscreen/tree/v1.10.0)
at commit `dbdadb7d27fe3287d994fb741d6f264a31066648`.

The older `siddharthvaddem/openscreen` repository was archived at v1.5.0 and is
continued by `getopenscreen/openscreen`. Therefore, this log describes only this
fork's additions to upstream v1.10.0; it is not a history of every upstream
improvement since v1.5.0.

For architecture, security boundaries, attribution and the publication process,
see [FORK.md](FORK.md).

For the dated review of newer upstream changes, see
[FORK-UPSTREAM-REVIEW.md](FORK-UPSTREAM-REVIEW.md).

## Unreleased — Imported video reliability and visual editing

- Fixes Windows transcription startup with Korean/Unicode profile directories
  without moving or redownloading the speech model.
- Fixes the D3D11 preview seek cache returning a cleared frame after EOF, including
  the last-frame re-seek encountered after speed edits.
- Adds bounded `inspectVideoFrames` to the editing agent: approved project assets
  only, up to four frames per call/eight per turn, with per-turn disclosure consent.
- Carries actual image content through Claude MCP, Codex dynamic tools, Anthropic
  API and OpenAI Responses configurations; unverified API transports are gated.
  Frame metadata includes source time, raw editing-ruler
  positions, trims and crop coordinates; existing edit consent and undo remain.
- Local QA only, not a public release or replacement of the installed app. The bugfix
  package passed isolated Windows IPC checks. One approved Opus 5.5 turn inspected
  eight real frames and added two zooms to a separate QA document.
- Follow-up `.13.qa.3` unpacked Windows QA includes visual editing. One separately
  approved four-frame Opus 5.5 turn passed packaged extraction/edit/save, restart
  restoration and post-EOF rendering checks. Existing installation remains unchanged.
- See [visual editing verification](technical-documentation/testing/video-frame-analysis-2026-10-21.md)
  for evidence, limits and the distinction between packaged bugfix QA and source-level
  visual-agent integration checks.

## Unreleased — Dedicated preset voice runtime

- Adds Windows/NVIDIA preflight and separately confirmed setup of a dedicated
  Python, venv and fixed preset-voice packages on the user's selected drive.
- Shows complete download/disk requirements, reuses existing model files, checks
  hashes, runs offline wheel installation and validates actual test speech before
  connecting the new runtime. Existing Python/installations are preserved.
- Adds local diagnostic stages/errors and a longer cold-start validation bound;
  failed/cancelled attempts clean only their own new directory and preserve settings.
- Driver installation, CPU/Mac, automatic clone/transcription setup and download
  resumption remain separate work. This is development work, not a released installer.
- Local Windows QA: fresh dedicated environment installation, test speech,
  preview, normal narration application and restart restoration passed; see the
  [dated report](technical-documentation/testing/managed-voice-runtime-2026-10-15.md).
- Windows CI package QA passed runtime reuse, Korean narration preview/application,
  restart restoration and 1080p MP4 export. Fixed a duplicate missing-storage warning;
  [package QA and limits](technical-documentation/testing/managed-voice-runtime-ci-2026-10-15.md).

## Unreleased — Preset voice model setup

- Splits preset narration from optional cloning/transcription dependencies.
  Existing complete configurations remain valid; clone paths can be disconnected
  without deleting their models.
- Adds an explicitly confirmed Windows x64 preset-model setup flow: choose trusted
  Python and storage, run offline Python/CUDA diagnostics, review download size
  and free space, then download or reuse the pinned 1.7B CustomVoice snapshot.
- Verifies file sizes/SHA-256, uses isolated staging, handles cancellation and
  protects existing model folders/configuration. Closing the owner aborts work;
  normal app quit waits for cleanup. No private voice/project upload is involved.
- Python/packages/drivers remain prerequisites. This is not complete fresh-PC
  provisioning, Mac support, a new installer release or an inference-time download.
- See [setup architecture](technical-documentation/architecture/studio-runtime-setup.md#preset-model-installer).
- Isolated app verification covered preset-only local generation, preview/apply
  and restart; [QA record](technical-documentation/testing/preset-voice-setup-2026-10-15.md).

## Unreleased — Local runtime setup

- The Windows CI payload passed isolated configuration, consent, cancel/discard,
  live runtime recognition, restart and read-only override checks without running
  Setup. See [CI setup QA](technical-documentation/testing/runtime-setup-ci-2026-10-14.md).
- Adds a Studio setup panel for CLI discovery and explicit local voice/motion
  configuration, reachable from the menu and missing-runtime feature screens.
- Separates executable discovery from account connection and file checks from
  actual GPU/runtime availability. No automatic install, download or execution.
- Uses native path pickers, model validation, trust confirmation, atomic saved
  configuration and conflict protection. Explicit development overrides remain
  read-only. HyperFrames adopts saved runtime paths for subsequent jobs.
- Replaces the prominent raw HyperFrames path error with localized setup guidance
  and expandable technical details. Handles regional Korean locales.
- See [runtime setup](technical-documentation/architecture/studio-runtime-setup.md).
- Verified native-picker integration through QA selections, saved paths, live
  feature recognition and restart restoration; [dated QA record](technical-documentation/testing/runtime-setup-2026-10-14.md).

## Unreleased — Production workflow integration review

- The Windows CI package passed isolated scene-sheet/revision/assembly,
  packaged local narration, restart and narrated 1080p MP4 verification.
  Setup was not executed; the installed app and original inputs were preserved.
  See [CI package QA](technical-documentation/testing/ci-package-studio-qa-2026-10-14.md)
  for artifact identity, measurements and remaining setup/release gates.
- Automated Electron execution found and fixed two real runtime gaps: Windows
  narration workers now retain the local user name required by PyTorch cache
  setup while still excluding provider secrets, and narrated Studio MP4s use
  bundled FFmpeg instead of requiring renderer WebCodecs.
- Native narration mixing requires the caller's Save-dialog path grant and the
  exact saved layer, verifies a temporary output and preserves the existing
  export on failure/cancellation. Actual 20-second 1080p output, 1.5-second voice
  offset, unchanged video pixels and full restart restoration were verified.
  See [automated QA](technical-documentation/testing/automated-studio-qa-2026-10-14.md).

- Keeps a successfully saved product-demo draft visible when cancellation arrives
  during the save. Holds the job lock through final status persistence to prevent
  a second plan from replacing an unfinished request's state.
- Decouples the shared Studio renderer trust check from product-capture services.
- Adds a no-launch local QA preparation script with a new isolated profile,
  complete hashed native/runtime inputs and manual launch/stop commands. Existing
  profiles, provider credentials and personal voice references are not copied.
- See [integration review](technical-documentation/testing/integration-review-2026-10-14.md).
  This remains local development work, not a released installer.

## Unreleased — Windows MP4 duration correction

- Supplies one output-frame duration only when the Windows video encoder returns
  an unknown packet duration, before mux timestamp rescaling and including flush.
  Existing packet durations, PTS/DTS, picture content and AAC timing are unchanged.
- Extends native timing regressions for H.264 24/30/60fps, a one-frame export and
  H.265. Rebuilt native-module exports of the existing 19-second draft report
  correct video duration and average FPS at both 30 and 60fps.
- All 570 decoded pictures of the 30fps result match the prior GUI export.
  This is headless native validation, not a new GUI/installer/release approval.
  See [duration QA](technical-documentation/testing/export-duration-2026-10-14.md)
  and the [integration review plan](docs/studio-integration-review-plan.md).

## Unreleased — Natural-language scene planning

- Adds an **AI planning** tab using the configured API, Codex or Claude text
  provider. Explicit disclosure/consent precedes sending the brief, registered
  source metadata and current plan; transcript excerpts are optional.
- Proposes a strict, source-bound scene plan with rationale/missing materials.
  No editor tools, media upload, capture, generation or publishing are exposed.
- Allows native animatic review before explicit adoption into the scene sheet.
  Saving and assembling remain separate; stale or cancelled responses cannot
  overwrite a changed project. Footage has not been visually analyzed.
- This is an isolated development candidate, not an installer or release.

## Unreleased — Scene revision and recheck workflow

- Adds **Revise & check** to film planning: one-scene proposals, before/after
  source/output timing, caption/zoom comparison and bounded native previews.
- Requires explicit acceptance before updating the plan, blocks stale proposals
  and preserves later edits when undo would overwrite them. The editor timeline
  remains unchanged; assembly continues to create a separate draft.
- Persists separate user picture and reused-narration checks. Changed scenes,
  shifted timing and changed voice/tone context require rechecking. Rendering
  never approves scenes. Review JSON excludes private snapshots and retains
  pending final-output verification.
- Isolated from the previous tone checkout and installed app. See
  [scene planning architecture](technical-documentation/architecture/scene-planning.md).

## Unreleased — Narration tone selection and tuning

- New preset narration defaults to B (confident product introduction), with A
  (bright and clear), neutral delivery and bounded extra delivery directions.
- Uses local 1.7B CustomVoice instruction control, checked in both main process
  and Python. Unsupported models cannot silently ignore the requested tone;
  clone mode clearly retains reference-based delivery without A/B controls.
- Saves tone/model metadata, restores it, and preserves legacy audio identity.
  Script/tone changes require a fresh matching audition before applying; actual
  playback, rather than a play request, enables Apply.
- Separate-worktree tests, build and real local generation passed. Native GUI
  results are recorded in [tone QA](technical-documentation/testing/narration-tone-2026-10-14.md).
  Installed Studio and Claude workspaces remain unchanged.

## Unreleased — Composited animatic preview

- Adds a separate **Animatic** tab to film planning, using a private Studio
  compositor view for actual captions, manual zoom and hard cuts. Play/pause,
  scrub and scene jumps do not replace the open editor document or playhead.
- Requires native pixels before enabling playback and shows backend/init errors
  explicitly. Planning edits reset the preview; closing releases the view.
- Fixes a paused preview turning blank on scroll when native frame dimensions
  differ from the canvas layout. Keeps its pixels until a new packet arrives.
- Fixes pre-metadata audio seeks and source replacement: narration/source audio
  wait for metadata, seek before playing, and pause on replacement or unmount.
- Isolated Windows QA verified 19-second silent playback and unsaved caption
  edits. Six native/export frames passed measured comparison; both existing
  voice modes passed real Chromium audio-clock and waveform/40% mix checks.
  Narrated Studio GUI validation remains pending. No
  installed profile, Claude workspace or release was changed. See
  [the animatic validation record](technical-documentation/testing/animatic-2026-10-14.md)
  and [A/V measurements](technical-documentation/testing/animatic-av-2026-10-14.md).

## Unreleased — Scene planning and storyboard preview

- Adds **Film plan · Scene sheet** to the Studio product menu. Registered video
  assets can be arranged into reviewed scenes with source ranges, editable text
  and manual zoom direction, without a provider call or recording.
- Adds planning and preview tabs, with original video frames, source/output
  times, caption/zoom intent and a 390px mobile-width view. This scene sheet is
  not a final composited preview; use the separate animatic or editor for effects.
- Quantizes scene boundaries to 30fps and derives the assembly, captions, zoom
  anchors and review checkpoints from the same plan. Plans can be imported,
  downloaded, saved with undo and restored on restart. Assembly saves a new
  project, preserving the source timeline; later manual timeline edits are not
  silently written back into the planning snapshot.
- Removes the required decorative eyebrow and runtime-test overlay from the
  HyperFrames user workflow. The no-footage diagnostic remains identified.
- Windows isolated QA verified three scenes, an 18-to-19-second plan change,
  storyboard/mobile views, save/undo/redo, full restart of the saved plan and
  actual GUI MP4 export. No installer, installed profile or Claude workspace was
  changed. See [the validation record](technical-documentation/testing/scene-planning-2026-10-14.md).

## Unreleased — Editable product-scene zoom direction

- Adds optional reviewed zoom intervals and scale to product-demo shot plans.
  Focus comes from stable observed heading/panel geometry, never invented model
  coordinates. Unavailable focus keeps the full view and reports a warning.
- Saves normal clip-anchored Studio zoom regions, with existing easing, editing
  and undo. Fixes preset changes being ignored when a custom scale was present;
  the inspector now displays the effective custom scale too.
- Builds an 18-second actual PurplePrint product pilot with two 1.25x focus
  regions and the previously authorized local founder voice. Native-input GUI
  editing, undo, restart restoration and 1080p MP4 export were verified.
- Development-only: the pilot uses existing high-resolution footage; automatic
  capture remains 720p/up to 12 sampled fps, and full-film voice/shot alignment
  is not yet automated. See the [verification record](technical-documentation/testing/product-demo-2026-10-11.md).

## Unreleased — Local narration development integration

- Adds a separate developer CLI for Korean preset narration or an explicitly
  authorized local reference voice. No TTS API key or subscription is used.
- Requires preinstalled model files, disables inference networking, and preserves
  existing output takes. Personal recordings and model weights remain outside Git.
- Validates both modes on Windows/CUDA with matching-script samples and new real
  product footage; the document pane is widened before capture. The video retains
  the product's own UI without added eyebrows or decorative counters.
- Adds the development Studio Narration menu: preset/reference choice, local
  reference transcription, script, generation/cancel, playback before apply,
  replace/remove, output offset and original-audio gain. Saves an undoable
  project layer and mixes it into GUI MP4 export without re-encoding video.
- Verifies both modes in the Windows QA app through preview, apply, full restart
  and GUI MP4 export, with full decode and audio-offset checks. Corrects Korean
  locale detection (`ko-KR`) in the new production dialogs and menu. An earlier
  intermittent native export crash remains unresolved despite successful retries.
- This is not yet a released installer; Mac and portable narration packing are
  not supported by this slice. See the
  [runtime proof](tools/narration/README.md) and
  [verification record](technical-documentation/testing/narration-2026-10-11.md).

## Unreleased — Local HyperFrames rendering preview

- Pins HyperFrames 0.8.146 and GSAP 3.14.2 in a separate development runtime;
  the Electron dependency tree and installed release are unchanged.
- Adds a Studio menu for runtime status, scene text/duration and an optional
  registered project video asset. Renders a bounded local HTML template into
  1080p/30fps silent MP4 and saves a separate editable Studio project.
- Retains HTML, parameters, original source offset, copied assets, poster and
  diagnostics. Original recordings/projects are not overwritten. The rendered
  graphics are flattened; changing them requires another render.
- Runs without AI/TTS/cloud commands, ambient AI keys, global installs or agent
  configuration changes. Cancellation stops the owned renderer process tree.
- Validates render geometry, duration and full decode before project import.
  Diagnostic graphics are explicitly labelled as tests, not product footage.
- The real PurplePrint 15–20 second quality pilot waits for the independently
  prepared demo/tour. Runtime bundling, installer UX and macOS validation remain
  separate work. See [local runtime setup](tools/hyperframes/README.md).

## Unreleased — Product demo production preview

- Adds a Studio menu flow for a product URL and value-oriented brief, AI shot-plan
  review, isolated browser recording, and a new editable project with caption overlays.
- Supports public single-page websites and the existing Codex/Claude subscription
  runtimes. Captures only the dedicated browser viewport, without the user's Chrome
  cookies, desktop, microphone or other application windows.
- Bounds recording below five minutes and limits actions to observed headings and
  tabs. Cancellation and failures close the product browser; incomplete takes are
  not reported as a completed draft.
- Pilot: PurplePrint public website → 12 scenes → approximately 2:10 silent draft.
  Sample coaching/report screens are labelled as examples, not a new live session.
- Experimental and not released: login/forms, native desktop products, narration,
  multi-page exploration and AI-chat intent routing remain outside this first slice.
  See [implementation and validation boundaries](technical-documentation/architecture/product-demo-production.md).

## Unreleased — AI conversation persistence

- Saves each project's AI conversations, messages, generated-image references,
  manual compaction state and rewind checkpoints under the local Studio profile.
  Reopening the app restores the transcript and selects the newest conversation.
- Writes a temporary file and atomically replaces the prior history after every
  change. An unreadable history file is left untouched instead of being silently
  replaced with an empty one. Deleting a project also removes its saved chats.
- Older builds stored conversations only in memory, so chats already lost on
  restart before this change cannot be recovered.

## Unreleased — ChatGPT subscription image scenes

- Adds an explicit image-scene action to the AI session whenever ChatGPT
  subscription (Codex) is connected, even if conversation turns use Claude or
  another provider. The user confirms each generation because it consumes
  subscription limits. No API key is passed to the CLI, and the active chat
  provider/model is not changed.
- Copies the generated original image into the app-owned project media folder,
  previews it in the conversation, and creates a five-second MP4 still clip for
  the existing video-only Media panel. The original is kept beside the clip so
  later scene changes can start from the full-quality image.
- Keeps the Codex run read-only with shell, web, apps and editor tools disabled.
  The workflow does not yet animate images or integrate Blender, Hyperframe or
  the PurplePrint Design Coach. It is not part of the published `.11` build.

## 1.10.0-subscription.11 — 2026-09-28 (Windows prerelease)

- Adopts the PurplePrint GraphOS family's neutral surfaces, restrained violet
  accents, typography hierarchy and product mark across the editor and capture
  entry surfaces. Recording and semantic status colors retain their meanings.
- Renames visible app, installer, Start menu and macOS package labels to
  PurplePrint Studio. The technical app ID, data profile, `.openscreen` format,
  CLI command and GitHub update origin stay stable for compatibility.
- Keeps upstream attribution explicit. This work does not add Design Coach/MCP
  integration or claim GraphOS runtime integration.
- Before live installation, the unsigned Windows NSIS package was smoke-tested
  with an isolated profile. Packaged H.264 import, editor launch and MP4 export
  passed with synthetic media.
- An isolated profile created by the installed `.7` fork retained its project,
  media clip, light theme and preferences when opened by the Studio package;
  the old project exported a decodable MP4. A packaged Windows WGC window
  capture of a generated, non-user-content target also reopened and exported.
  This exercised native capture with automated control. On the installed `.8`
  app, the owner separately confirmed that a physical mouse click on the HUD's
  Screen button opened the source selector. The owner then selected a source,
  recorded six seconds, stopped from the HUD and opened the saved recording in
  Studio. A user-driven export remains unverified.
- Fixes the packaged audio-demuxer WASM URL used by automatic transcription.
  The installed `.8` opened a silent recording but showed a transient
  "Failed to fetch" transcription error because this URL resolved outside the
  packaged `dist/wasm` directory. After the `.9` upgrade, the owner recorded
  another silent clip without the error toast; its new project persisted a
  `no-audio` verdict and the owner exported an MP4 successfully.
- With the owner's approval, the `.8` NSIS installer upgraded the existing
  per-user `.7` registration. It removed the old executable, installed Studio
  in a product-named child folder beneath the prior custom location and replaced
  the Start-menu shortcut. A local backup was verified before installation;
  three existing project files and the AI configuration retained their hashes.
  Studio launched using the existing locale. The installed `.8` binary loaded
  an isolated copy of all three real project documents (three assets and three
  clips) and opened the editor without emitting their contents. The live
  profile was not used for this project-loading test; private footage was not
  exported.
- Builds Apple Silicon and Intel macOS DMGs in
  [the fork's validation workflow](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36320426373).
  Both passed architecture, native payload, bundle ID, ad-hoc signature, CLI
  boot and mounted-DMG checks. The bundled installation guide uses the Studio
  name and links Apple's current per-app security procedure. A real Mac record →
  edit → export pass, Developer ID signing and notarization remain release
  gates. This `.11` distribution does not include a macOS installer.
- Advances the unpublished candidate to `1.10.0-subscription.9`. The `.8`
  candidate refreshed the Nix dependency hash and checked the rebranded CLI
  banner in macOS packaging. The unsigned `.9` Windows NSIS installer was built
  and its packaged WASM path checked, then installed on the owner's PC after a
  verified backup. Nine installed payload files matched the `.9` build, the
  registered version was `.9`, and the Start-menu shortcut kept its target.
  This developer PC
  lacked `libclang.dll` for a fresh compositor rebuild, so packaging reused the
  verified `.8` compositor binary with the same SHA-256; the WGC helper was
  rebuilt. [macOS `.9` CI](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36358715037)
  built Apple Silicon and Intel DMGs and passed payload, bundle identity,
  architecture, ad-hoc signature structure, CLI boot and mounted-DMG checks.
  A real Mac record → edit → export pass and notarization remain unverified.
- Advances the Windows source candidate to `1.10.0-subscription.10`. Update
  discovery now reads published releases in the installed `subscription`
  prerelease channel; GitHub's `/releases/latest` endpoint returned 404 while
  the fork had only prereleases. Drafts and unrelated channels are ignored,
  versions are compared semantically, and release URLs remain restricted to
  this fork. A clean Windows packaging workflow rebuilds the native helpers
  and verifies the installer without publishing it. The Windows speech runtime
  is pinned to a checksum-verified artifact built by this fork rather than an
  upstream workflow artifact.
- The `.10` clean Windows package passed CI and was installed locally after a
  verified `.9` backup. The owner reported a first recording attempt where the
  three-second countdown ended but native capture had not yet acknowledged
  startup; a second click received "already running". Retrying later recorded
  and exported MP4. `.11` blocks overlapping start requests and
  shows a localized "Starting…" spinner while waiting for the native helper.
  The clean `.11` Windows package passed CI and was installed on the owner's PC.
  The owner confirmed a successful test recording, MP4 export and an installed-app
  "up to date" check. A real future-version updater download/install remains
  unverified. This `.11` release is Windows-only.

### Validation correction · 2026-09-28

The pre-`.11` copy of 2,868 profile files was mistakenly taken from an older
`openscreen` profile. It was **not** a backup of Studio's active
`openscreen-subscription` profile. The claim that six active project/recording/
AI-config files remained hash-identical across the `.11` upgrade is withdrawn.
The `.10` installed directory and rollback installer were backed up, but no
immediately pre-`.11` active-profile snapshot exists. A verified pre-`.10`
active-profile backup is retained: all 19 checked critical files are still
present, 18 have unchanged hashes and one now differs (timing and cause unknown). The
post-`.11` active profile has seven projects; a new backup matches 5,628 relative
file paths and sizes and 29 critical file hashes. This does not prove no file
changed during the `.11` upgrade. The public release notes carry this correction.

## 1.10.0-subscription.7 — 2026-09-27

### GPT-6 model catalog

- Adds GPT-6 Sol, Astra and Luna to the preferred OpenAI model catalog, using
  each model's published 1,050,000-token context window where the active
  runtime does not provide a more specific value.
- Adds a GPT-6 catalog entry only when the connected Codex CLI or OpenAI API
  actually returns that ID. The OpenAI API default proposes Sol, but does not
  imply that a given API key can use it.
- Uses the Responses API for GPT-6 API calls and limits reasoning choices to
  those supported by the selected model; existing Astra settings without a
  valid effort fall back to Low.
- The local Codex CLI was updated to 0.157.1 for validation. Its live
  `model/list` response exposed all three GPT-6 models; this is not a guarantee
  that every user's subscription exposes them.
- The existing effort selector still tops out at Extra high; the official
  GPT-6 `max` effort is not exposed by this catalog update.

### Release and maintenance

- Refreshes the Tiptap editor packages, Electron 41 runtime, Vitest and affected
  transitive dependencies. A clean install and npm audit report zero known
  advisories at release preparation time.
- Makes the branch-protection-required Nix dependency hash check run on every
  pull request, including changes that do not touch the lockfile.
- Includes the dated upstream review in the fork package alongside this log.
  The upstream fixes identified there are **not** integrated in this version.

## Cumulative differences from upstream v1.10.0

| Area | Fork improvement |
| --- | --- |
| Windows recording | Preserves non-ASCII paths, including Korean user and output directories, through the native WGC capture process. |
| ChatGPT subscription | Routes through a user-installed official Codex CLI `app-server`, using an OpenScreen-owned CLI profile instead of copying credentials or inheriting API keys. |
| Claude subscription | Uses the user's installed, unmodified Claude Code CLI and its externally managed authentication. |
| Claude models | Discovers the current model catalog from the local CLI and shows friendly resolved names, including returned 1M-context variants. |
| GPT-6 models | Prefers Sol, Astra and Luna when available through the connected Codex runtime or OpenAI API, with verified context limits and model-specific reasoning options. |
| AI chat | Aligns user and assistant messages, renders safe Markdown, improves streaming, and exposes time/copy/rewind actions on hover or keyboard focus. |
| Context display | Separates estimated selected history, the user's reference value, and a verified context window for the active provider/model when available. |
| Distribution | Uses a separate app identity, user-data directory, installer name, update origin and release configuration from upstream. |

## 1.10.0-subscription.6 — 2026-08-31

### macOS validation prerelease

- Adds fork-branded DMG builds for both Apple Silicon and Intel Macs, preserving the
  fork bundle identifier, product name, user-data separation and GitHub update origin.
- Verifies the ScreenCaptureKit helper, Metal compositor, speech runtime, executable
  architecture, bundle identity, ad-hoc hardened-runtime signature, packaged CLI boot
  and mounted DMG before collecting release assets.
- Pins speech-runtime staging to an explicit successful producer run. The previous
  release workflow asked `gh run download` to inspect its own still-running job and
  failed before either macOS package could be built.
- Prevents subscription tags and releases from entering the upstream-oriented build
  and Discord announcement paths.

### Local AI compatibility

- Finds Codex CLI and Claude Code when OpenScreen is launched from Finder, whose PATH
  normally omits Homebrew and user package-manager directories.
- Checks `~/.local/bin`, `~/.npm-global/bin`, `~/.volta/bin`, `~/Library/pnpm`,
  `/opt/homebrew/bin` and `/usr/local/bin` without invoking a shell or copying CLI
  credentials.

### Distribution status

- macOS packages remain prerelease-only until a real Mac completes the manual
  record → edit → export checklist.
- The initial packages are ad-hoc signed and not notarized by Apple. Installation and
  privacy-permission guidance is recorded in [MACOS-INSTALLATION.md](MACOS-INSTALLATION.md).
- Local validation passed 2,243 unit tests with 4 skipped across 189 files, both
  application and test TypeScript checks, documentation, i18n and Biome. Biome
  retained 14 pre-existing warnings.

## 1.10.0-subscription.5 — 2026-08-30

### Added and changed

- Shows the selected model's verified context window in the context pill and
  settings dialog when the local runtime reports it or the exact model ID matches
  a current official specification.
- Uses that window as the display denominator while keeping the existing
  user-configured history reference visible and editable.
- Labels whether the value came from the active runtime/context variant or an
  official model specification. Unknown and custom gateway models display
  **Not available** instead of receiving a guessed limit.
- Accounts for Claude `[1m]` selections, `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, and
  gateway behavior. A runtime-reported numeric limit takes priority over the
  maintained specification table.

### Scope

The numerator remains an estimate of the selected conversation history. It does
not include system instructions, tool schemas, project data, reasoning tokens or
the model's response, so the percentage is approximate and never triggers
automatic compaction.

Validation: 2,241 unit tests passed and 4 were skipped across 189 files; app and
test TypeScript checks, 13-locale i18n, documentation and Biome completed
successfully. The live local Codex and Claude catalogs were read without sending
an inference prompt, and an isolated Electron UI pass verified the 1M Sonnet 5
badge and context dialog.

### Distribution status

- Prepared as the fork's first public GitHub prerelease after the owner approved
  publication on 2026-08-30.
- Windows x64 only. The installer remains unsigned and is published with SHA-256
  checksums, package verification and explicit validation limitations.
- GitHub Actions is enabled for `fork/main`, `feat/**` and `release/**` so future
  fork branches do not rely only on local validation.

## 1.10.0-subscription.4 — 2026-08-28

Runtime/package commit: `eabe87b24cb321fe41642011f3f960abee72e9bb`

### Added

- Reads `ModelInfo[]` from the official Claude Code CLI streaming initialize
  response. Catalog discovery sends no user prompt and starts no inference turn.
- Shows friendly Claude model names in AI settings and in the chat model picker.
  The catalog observed during validation included Opus 5 (1M), Sonnet 5, Haiku
  4.5, Fable 5 (1M) and Opus 4.8 (1M).
- Adds **Refresh models** and **Enter model ID** controls.

### Preserved boundaries

- Passes the CLI's original selection value through unchanged. Aliases remain
  aliases, explicit model IDs stay pinned, and `[1m]` suffixes remain intact.
- Keeps a saved custom model when catalog discovery fails. A catalog entry does
  not guarantee account access, remaining quota or subscription-covered usage.
- Does not change the user's configurable context-meter reference when a 1M model
  is selected.

### Validation snapshot

- 2,225 unit tests passed and 4 were skipped across 188 files.
- App and test TypeScript checks, 13-locale i18n checks, documentation checks and
  Biome completed successfully. Biome retained 14 pre-existing warnings.
- The installed Windows build displayed the live catalog, preserved existing app
  data and exported a test project to a fully decodable 1280×720 MP4.

## 1.10.0-subscription.3 — 2026-08-28

Runtime/package commit: `4e58f92cd963ce6b9401dc2a07c4a5376953dcca`

### Added

- Adds **Claude (local)** as a provider backed by the user-installed official
  native Claude Code CLI.
- Reuses the CLI's active, user-owned authentication environment. OpenScreen does
  not copy Claude tokens, implement Claude OAuth, or replace `CLAUDE_CONFIG_DIR`.
- Streams CLI output and exposes only the existing OpenScreen editor tools through
  a loopback-only, bearer-protected, per-turn MCP endpoint.

### Safety and lifecycle

- Disables the CLI's built-in filesystem and shell tools for OpenScreen turns.
- Keeps editor argument validation, project-edit permissions and rewind
  checkpoints on the OpenScreen side.
- Uses ephemeral turns with no Claude session persistence and removes temporary
  MCP/prompt material after each turn.

## 1.10.0-subscription.2 — 2026-08-27

Runtime/package commit: `98c12507c0f57604f551fb131091eca6efe72a6c`

### Added and changed

- Makes the conversation token-meter reference configurable from 1,000 to
  2,000,000 tokens, retaining 80,000 as the compatibility default.
- Aligns user messages to the right and assistant messages to the left, removes
  redundant speaker labels, and reveals timestamps, copy and rewind controls on
  hover or keyboard focus.
- Renders assistant responses with sanitized Markdown and GFM. Raw HTML, remote
  images, local-file links and custom URL protocols remain blocked.
- Coalesces streamed text and reasoning updates per animation frame, replaces the
  live row cleanly at completion, marks interrupted output, and avoids late replies
  crossing into another project.
- Keeps message checkpoints and confirmation before rewind.

### Clarification

The configurable number is a UI/reference budget for estimated selected history.
It does not modify a provider's real context window, the selected history policy,
or manual compaction behavior.

## 1.10.0-subscription.1 — 2026-08-27

Runtime/package commit: `05ba62540d4d94d298b9c43f73ce7dcaba565503`

### Added and fixed

- Changes the Windows native capture helper to use wide-character arguments,
  preserving recording and export paths containing Korean or other non-ASCII text.
- Adds **ChatGPT subscription (Codex)** through the official local Codex CLI
  `app-server` over stdio.
- Gives Codex an OpenScreen-owned profile and explicitly removes inherited OpenAI
  and Codex API keys from subscription-mode child processes.
- Routes the existing validated editor tool set to Codex while retaining project
  permissions and checkpoints.

### Fork distribution separation

- Introduces a distinct app/product identity, installation directory, user-data
  directory, installer name and GitHub update origin.
- Adds a fork-specific Windows build configuration and staged dependency checks.
- Retains upstream licenses and third-party notices and documents the publication
  gates in [FORK.md](FORK.md).

## Publication status

- Source branches and commits may be published in this fork repository.
- No entry in this file means an upstream pull request was accepted or endorsed.
- No installer is a GitHub Release unless it appears on this fork's Releases page.
- Local Windows installers described above are unsigned unless explicitly stated
  otherwise in their release notes.
