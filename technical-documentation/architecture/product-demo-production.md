# Product demo production preview

Status: local experimental implementation on `feat/product-demo-production`. Not in an installer or public release.

## User flow

Studio's product menu → **Create product demo · Preview** → URL, product, audience/value brief, maximum duration → **Open product and plan with AI** → review/edit captions → approve recording → **Open editable draft** → existing editor and MP4 export.

First validation subject: `https://purpleprint-ai.com/`. The requested introduction must be under five minutes and explain the value as well as the features. The initial pilot targets roughly two minutes. Public coaching/report examples are labelled as examples; they are not represented as a freshly executed authenticated coach session.

**Owner correction, 2026-10-11:** this pilot is a landing-page walkthrough, not the requested product demonstration. Keep it as capture/edit plumbing evidence, not the visual or content baseline for the final film. The next version must use Claude's curated demo project and product tour. See [product film quality v2](product-film-quality-v2.md) for the proposed source handoff, capture-quality and HyperFrames integration work.

## Implemented scope of this slice

- One public web page in a dedicated Electron BrowserWindow, 1280×720. No system pointer/keyboard injection or user's Chrome session.
- Selected Codex subscription / local Claude runtime generates a bounded JSON shot plan from the brief and an observed DOM snapshot. API-key planning is not wired in this preview.
- Each scene points to an observed heading or ARIA tab, not model-written code or a selector. At most 16 scenes, 4–25 seconds each, total bounded by the brief (maximum 299 seconds).
- User reviews the plan before the capture pass. Captions can be changed without another model call.
- Optional scene framing adds a reviewed zoom interval and scale (1.05–1.5x), not
  LLM-generated coordinates. The recorder samples the actual heading text or a
  tab's explicitly associated panel three times before native zoom lead-in. Only
  stable, fully visible geometry becomes a manual-focus, clip-anchored Studio
  zoom region. Missing, moving, late-observed or overlarge targets keep the full
  view and produce a visible warning. Focus is not continuous object tracking.
- Framing uses Studio's existing eased region transitions. Region start is not
  the first moving frame: native lead-in begins about one second earlier. The
  plan leaves return time at the end. Scale is capped to retain the observed
  bounds with reading margin; zoom cannot add detail to the 720p capture source.
- After opening the draft, the normal zoom track supports focus/interval/preset
  changes and undo. Selecting a preset clears a prior custom-scale override,
  and the inspector shows the actual custom scale before that change.
- Real browser viewport frames sampled at up to 12 fps, timestamped and encoded at 30 fps. Frame duplication does not create 30 fps motion. No microphone or system audio.
- Each take is retained separately. A new schema-v7 Studio document lays out the takes sequentially, with clip-anchored editable caption overlays and explicit no-audio metadata. Existing projects are untouched. Open-draft saves any dirty current project first and refuses to switch when that save fails.
- Job metadata, completed takes and a `.openscreen` document are kept under `<userData>/product-demos/<uuid>/`. Failure/cancellation is never reported as a complete draft. Partial material stays available in the displayed folder.
- Closing the production dialog, closing its owning renderer, cancellation, failure or completion closes the product browser. Restart recovery/resume is not implemented; files survive, live jobs do not.

## Boundaries

Remote content uses an ephemeral partition with no preload, no Node, context isolation and sandbox enabled. Permission grants, downloads, popups and webviews are denied. Only HTTPS (or explicit HTTP loopback development URLs) is accepted. Cross-origin navigation is blocked, and after inspection the document URL is locked except for its fragment. Browser content cannot invoke the production IPC; the handler checks the calling main frame against Studio's exact renderer file or configured dev origin and binds the job to that renderer.

The planner receives untrusted page text, no credentials, local files or browser storage. Page text cannot add executable actions. A current matching label, role and occurrence are required at execution time. These are restricted UI actions, not proof that every third-party tab handler is free of side effects; users should use demo-safe public products. Login, arbitrary clicks, forms, purchases, posting, native desktop apps, OS dialogs, browser extensions, video narration and full agent exploration of multiple pages are outside this slice.

No changes are made to the PurplePrint MCP/coaching implementation owned by the separate Claude workstream. No ChatGPT/Codex desktop automation capability is bundled or implied.

## Verification

Unit coverage lives beside `electron/product-demo/`: URL/plan limits, stale targets, script target selection, timing, new-document construction, cancellation, failure and isolation. `ProductDemoDialog.test.tsx` covers review before capture, caption edits and close-to-cancel.

The opt-in `scripts/validate-product-demo.ts` runs the same browser, live planner, capture and document builder in a separate QA profile. It requires explicit output/config/URL arguments and uses model allowance. Its `--record=yes` flag opts into recording the generated plan. The isolated harness supports the user's existing Claude CLI authentication without copying tokens; Codex's app-owned auth must be tested through the desktop UI.

```powershell
npx esbuild scripts/validate-product-demo.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-electron/product-demo-smoke.mjs
node node_modules/electron/cli.js dist-electron/product-demo-smoke.mjs --out=D:\qa\product-demo --config=D:\qa\llm-config.json --url=https://purpleprint-ai.com/ --record=yes
```

Set `OPENSCREEN_FFMPEG_PATH` only when the development checkout has no complete native bundle. Do not copy isolated DLLs: use the installed build's bundled ffmpeg with its sibling libraries or a complete built native directory.

This integration exercise is not a physical-input manual smoke test or release validation. Installer/macOS QA and authenticated product demonstrations remain separate gates.

## Next slices

1. Capture quality: adaptive framing, optional motion/cursor, scene-level retakes and an output preview inside production review.
2. Agent exploration of multiple explicitly allowed pages, observation after each action and a visible action log.
3. User handoff for login, demo data and sensitive actions. Never copy the user's Chrome cookies.
4. Connect the workflow to AI-session intent routing, add other providers, and then separately evaluate a desktop-app driver.
