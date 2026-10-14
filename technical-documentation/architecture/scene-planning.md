# Scene planning

The product menu's **Film plan · Scene sheet** dialog plans a sequence from media
already registered in the open Studio project. Manual planning remains local.
The **AI planning** tab calls the configured provider only after explicit payload
review/consent. Neither path captures another app, accepts executable composition
code, generates media, publishes a video or automatically changes the timeline.

## Natural-language planning proposals

`scene-planner.ts` defines the bounded request/proposal contract and the exact
provider projection. The input includes a brief, maximum duration, project title,
registered video IDs/names/durations/dimensions and current valid plan. Transcript
excerpts are opt-in, capped at 120 segments of 400 characters. Paths, media bytes,
voice references and chat history are not projected. User-authored names and text
may still contain sensitive information, so the exact JSON is available before
the explicit consent checkbox and submit button.

`electron/scene-planner/service.ts` uses the existing text-only model factory,
including the Codex/Claude runtime adapters, with no editor tool graph. The API
factory's optional retry override is zero for planning and unchanged elsewhere.
One request per calling window is allowed, with a three-minute timeout, matching
ID cancellation, route-change checks and no automatic resubmission. Trusted
main-frame IPC is required; navigation, destruction and app exit cancel work.
Cancellation cannot promise that a provider charges no usage already consumed.

Responses must parse as a strict proposal containing a validated plan or an
honest missing-materials response. Existing source bounds, IDs, 30fps timing,
16-scene/five-minute limits and the requested duration remain enforced. A note
must accompany each scene; transcript-based notes require supplied overlapping
speech. These checks do not prove semantic or visual truth. The UI always says
the footage has not been viewed and must be visually checked. Model text is
rendered as text, never executable HTML or commands.

The proposal is temporary until explicitly accepted into the local planning
view. Adoption rejects changed project/media/narration/plan context, opens the
scene sheet and does not save or assemble. Existing checks remain separate and
derive stale status from changed content. **Save plan** and **Assemble new draft**
remain separate user actions. Request text and rationale are not yet persisted
as proposal history; only the accepted plan can be saved. No cross-project,
vision, recapture, image generation, voice generation or publishing capability
is introduced by this interface.

## Data and timing

`src/lib/scene-plan.ts` owns the strict version-1 plan schema and pure assembly.
Plans contain registered asset IDs, source in/out seconds, text and optional
manual zoom scale/focus. They cannot add arbitrary paths, scripts or URLs. Import
accepts a local JSON file up to 128 KiB and checks media existence in the project,
probed dimensions/duration, source bounds, unique scene IDs and a five-minute
limit. The limit is 16 scenes. File availability at playback/export remains the
existing media pipeline's responsibility.

`scheduleScenes` rounds each source boundary to a 30fps frame and lays the scenes
back-to-back. The scene sheet, new document and `sceneReviewPlan` use this result.
Output frame rate is still selected in the normal export dialog; 30fps planning
does not claim the source was captured at 30 unique frames per second.

Assembly creates a new `AxcutDocument` with ordinary clip-anchored annotations
and zoom regions. It uses the existing document, undo, preview and exporter
contracts, not another playback timeline. Zoom focus is user-authored, not
claimed to be tracked from DOM geometry. Scenes shorter than 3.2 seconds omit
zoom and show a warning. Source media bytes are not modified or duplicated.

## Planning and editing

Explicit **Save plan** persists the validated plan in `legacyEditor.scenePlan`
with an undo step. Closing an unsaved plan does not apply it. Reopening or a full
app restart restores the saved plan. **Assemble new draft** writes a separate
project, saves dirty source edits before opening it, and refuses navigation after
a save error or project switch.

The saved plan is an authoring snapshot. Subsequent manual changes to an
assembled editor timeline do not rewrite that snapshot. Reassembly always makes
a new draft rather than overwriting later manual edits. Review JSON describes
the plan and retains `visualReview: pending`; it is not an approval or a claim
that the exported frames have been inspected.

The preview tab shows original video frames and the planned text/timing/focus.
Its optional 390px-wide layout helps inspect the storyboard. Native editor
compositing is not reproduced by the HTML video cards; final zoom/text rendering
must be inspected in Studio and the exported file.

## Composited animatic

The separate **Animatic** tab builds a transient document with the same assembly
function and `buildSceneDescription` used by the editor/export pipeline. It owns
a private native compositor view and supplies inspector parameters through an
explicit sink; it never replaces the global editor document or compositor ID.
Opening planning pauses editor playback without moving its playhead.

Playback requests frame-quantized clip-local source times. The driver serializes
configuration/clip changes and coalesces rapid seeks to the latest requested time.
Controls include play/pause, scrub and scene jumps. Plan changes remount playback
at zero. The last output time presents the final valid source frame instead of EOF.
Readiness requires both completed configuration and a valid native pixel packet;
missing backends, terminal native errors and initialization timeout are visible.
It does not silently substitute an uncomposited HTML video.

The view hook owns native-view destruction and stops frame polling on unmount.
Only incoming pixel packets resize an already painted canvas: scroll/resize
notifications preserve the paused picture until a replacement frame arrives.
Preview resolution and cadence depend on the viewport/device; using the same
compositor is not a promise of pixel-identical preview/export resolution or 30
unique preview frames per second. Transitions currently remain hard cuts.

Source audio follows the selected clip; explicitly reused narration shares the
existing narration playback component. Both use `TimelineAudio`: metadata must
be available before playback starts, a pre-load seek is applied on metadata
arrival, paused seeks are frame-precise, and replacing/unmounting a source pauses
the old element. Live drift above 80ms is corrected to the requested clock;
this threshold is not a hardware-wide A/V latency guarantee. This does not add
word alignment or new voice generation.

## Scene revisions and user checks

The **Revise & check** tab captures a one-scene proposal against the current plan
and registered source context. Candidates reuse the planning fields/validation.
Before/after cards show source ranges, output positions, caption and zoom. One
native animatic alternates between the complete before/after plans, bounded to
the selected scene, preserving project-level narration timing without playing
two compositor/audio instances. The exclusive end holds the last valid frame.

Accept explicitly replaces the scene in the local planning snapshot, not the
editor timeline or a previously assembled draft. Source/media, narration or plan
changes since the proposal began block stale acceptance. Save/assembly, tab
changes and closing are blocked while a proposal is unresolved. Discard keeps
the plan unchanged. The last accepted proposal can be undone across tabs only
when it would not overwrite later plan edits; saved-plan undo uses the document
store as before.

`scene-review.ts` stores optional `legacyEditor.scenePlanChecks` separately from
portable plan JSON. Each scene has user picture and reused-narration checks.
These are explicit assertions, never automatic consequences of playback,
rendering, assembly or accepting edits. Private keys snapshot the scheduled scene
and registered media/context; narration checks also include voice/tone/offset/gain.
Edited scenes and shifted positions become stale; unchanged scenes retain their
checks. Voice changes invalidate narration, not picture checks. No reused voice
means no narration check, not certification of the source audio.

Keys compare registered metadata, not file-content hashes: rewriting media bytes
externally at the same path without metadata changes is not detected. These are
not signatures or proof of who watched a video. Review JSON exports derived user
statuses, not private keys, media paths or voice metadata; `visualReview: pending`
still requires final output review. Importing a plan resets local checks. A new
assembled project does not inherit a claim that its export passed review.

## Narration reuse

Reusing an existing saved narration is explicit and off by default. Assembly
copies its generated-audio reference, offset and gain to the new project ID.
It does not regenerate, stretch or retime the voice, nor include private speaker
reference files in planning/review JSON. The dialog warns that scene changes
require a fresh narration/focus timing review. Multitrack narration and automatic
word alignment are outside this contract.

## Verification

Pure tests cover frame quantization, duration ripple, source identity, new-project
isolation, invalid inputs and narration handling. Dialog tests cover shared
preview state, explicit save/assembly and failure handling. Native Windows input
and export results are recorded in
[the scene-planning QA record](../testing/scene-planning-2026-10-14.md).
Animatic interaction, the paused-scroll regression, and remaining validation
limits are recorded in [the animatic QA record](../testing/animatic-2026-10-14.md).
Native pixel comparisons and real Chromium audio-clock/mix measurements are in
[the A/V validation record](../testing/animatic-av-2026-10-14.md).
Scene proposal comparison, adoption/undo, check invalidation and renderer reload
are recorded in [the scene-review QA record](../testing/scene-review-2026-10-14.md).
Natural-language proposal boundaries and current validation limits are in
[the AI planning QA record](../testing/scene-planner-2026-10-14.md).
The actual GUI-created draft/export and an existing duration-metadata discrepancy
are recorded in [the planner export QA record](../testing/planner-export-2026-10-14.md).
