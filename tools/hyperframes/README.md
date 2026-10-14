# Studio local HyperFrames runtime (development preview)

This directory is deliberately separate from Electron's npm dependency tree.
It does not install global CLIs, agent skills, MCP servers or Claude plugins.
It is **not included in the released Studio installer**. The installed `.12`
application is unchanged. Windows is the only locally exercised platform.

## Installation

Use Node 22.22.1 / npm 10.9.4 for this repository. From its root:

```powershell
npm ci --prefix tools/hyperframes --ignore-scripts --no-fund
```

The lockfile pins HyperFrames **0.8.146** and GSAP **3.14.2**. Do not use
`hyperframes init` here: runtime installation must not modify another agent's
skills or configuration. Do not substitute an unpinned global `npx` invocation.

Install the renderer's matching dedicated Chrome Headless Shell (this downloads
a browser; it does not reuse a signed-in Chrome profile):

```powershell
node --input-type=module -e "import {install,Browser} from './tools/hyperframes/node_modules/@puppeteer/browsers/lib/main.js'; console.log(await install({browser:Browser.CHROMEHEADLESSSHELL,buildId:'152.0.7977.30',cacheDir:'./tools/hyperframes/browser'}));"
```

Create **gitignored** `tools/hyperframes/local-runtime.json` with absolute paths:

```json
{
  "nodePath": "C:/path/to/node.exe",
  "browserPath": "C:/path/to/chrome-headless-shell.exe",
  "ffmpegPath": "C:/path/to/ffmpeg.exe",
  "ffprobePath": "C:/path/to/ffprobe.exe"
}
```

FFmpeg must support libx264. The external FFmpeg used for development is not
copied into Studio's distribution or substituted for its bundled native tools.
The current Korean template uses the Windows-local Malgun Gothic font; the font
is **not copied or redistributed**. Check font availability before using this
template on another OS.

For a QA app outside the worktree, set `STUDIO_HYPERFRAMES_RUNTIME_DIR` to this
directory before launching. The main process reads it; the renderer cannot supply
an executable or command. Missing configuration produces an unavailable status,
not a global install, download or cloud fallback.

## Studio use

Build/start the development app. Open **PurplePrint Studio → HyperFrames · Local
motion**. With no source selected, the output explicitly says it is a runtime
diagnostic, not product footage. When an approved recording exists, select its
registered project asset and source offset. Enter scene text and 6–20 seconds,
then choose **Render locally → new project**. The actual product-quality pilot
remains gated on the demo/tour being ready and must be 15–20 seconds.

Each job under `userData/motion-scenes/<uuid>` retains `index.html`, `scene.json`,
local assets, render status/logs, MP4, poster, probe and a `.openscreen` draft.
The original recording/project is never overwritten. The result is a flattened
video clip: timeline trims and Studio overlays remain editable, but its rendered
graphics require a new render. The UI regenerates the bounded Studio template;
it does not execute arbitrary edited HTML. Advanced HTML edits can be rendered
explicitly with the local CLI outside the app and imported as video.

Local render processes receive no ambient AI keys, have telemetry/update checks
and auto-install disabled, and use no AI/TTS/cloud commands. Close/Stop cancels
the owned process tree. Complete geometry/duration probing and full decode must
pass before a new project is imported. This is not an OS security sandbox for
arbitrary third-party compositions; only the Studio-authored template is accepted.

## Repeatable integration check

```powershell
npx esbuild scripts/validate-hyperframes.ts --bundle --platform=node --format=esm --outfile=tools/hyperframes/.build/validate.mjs
node tools/hyperframes/.build/validate.mjs --out=C:/existing-parent/new-QA-folder --runtime=C:/path/to/repo/tools/hyperframes
```

The output folder must be new. This creates an 18-second neutral diagnostic and
isolated project files; no real profile, product site or subscription is used.

## Attribution and distribution boundary

- HyperFrames: [HeyGen source](https://github.com/heygen-com/hyperframes), npm package
  metadata declares Apache-2.0. See the upstream LICENSE and NOTICE when preparing
  a redistribution. [CLI documentation](https://hyperframes.heygen.com/developers/cli).
- GSAP: Copyright GreenSock. Its package declares the
  [GSAP standard license](https://gsap.com/standard-license/); it is **not MIT**.
  The copied `gsap.min.js` retains the upstream copyright/license header.
- Chrome Headless Shell and any external FFmpeg have their own licenses/notices.
  Node and browser binaries, local paths, caches and rendered media stay ignored.

Bundling these runtimes, installer setup/download UX, automatic updates, macOS
font parity and commercial redistribution review are separate release work.
