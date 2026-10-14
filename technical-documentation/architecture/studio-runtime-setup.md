# Studio runtime setup

**PurplePrint Studio → Studio setup** inspects optional AI/voice/motion tools and
connects already prepared local runtimes. Importing and editing video does not
require these optional tools. The setup panel never installs packages, downloads
models, launches a CLI, signs in, generates media or moves model/project files.

## User flow

- Codex and Claude cards use the existing native-executable discovery functions.
  Discovery is not login, version compatibility or account entitlement. **Open AI
  settings** continues through the existing provider connection flow; API-key
  providers do not require a CLI.
- Narration lets the user select Python, CustomVoice, Base and faster-whisper
  directories through native pickers. Paths, required weight/config files, model
  roles and the speech-tokenizer directory are checked. The displayed GiB count
  covers selected weight files, not a download estimate or total disk footprint.
  Both preset and clone dependencies are required by the current runtime contract.
- HyperFrames selects a prepared runtime directory. Its existing pinned-package,
  entry-point and executable-path validation is reused. It must already contain
  `local-runtime.json`, the pinned npm packages and external tools.
- Selection only edits a draft. Saving requires valid paths plus explicit trust
  acknowledgement. Cancelling a picker preserves the draft; **Discard changes**
  reloads saved settings. Invalid inputs and conflicting writes preserve the
  previous configuration.

Missing narration/motion environments link to this panel. HyperFrames presents
localized recovery guidance before a collapsed technical-details section rather
than showing raw filesystem errors as the main explanation.

## Persistence and execution

Narration saves the existing four-field `narration-runtime.json` in userData.
HyperFrames saves `{ "runtimeDir": "<absolute local directory>" }` in
`hyperframes-runtime.json`. Explicit `STUDIO_NARRATION_RUNTIME` and
`STUDIO_HYPERFRAMES_RUNTIME_DIR` overrides take precedence; their setup sections
are read-only. Other apps, shell profiles, global CLIs and the selected runtime
directories are not modified.

Narration rereads its configuration before generation. HyperFrames resolves the
saved directory for idle status and at the start of a new render, retaining the
chosen paths for that job. Existing output and active render settings are not
retroactively changed. A complete application restart preserves saved paths.

"Files checked" is deliberately narrower than "ready to generate": Python
libraries, GPU operation and the actual runtime commands are exercised only by a
later explicit generation/render request. Tone control requires 1.7B CustomVoice.
Windows/CUDA is the locally validated voice environment, not a claim of CPU/Mac
support. Fresh-machine installation and automatic dependency management remain
separate work.

## Trust and concurrency

`studio:setup` accepts a strict action/field schema, never renderer-supplied paths,
commands or configuration payloads. Only the trusted main frame can call it.
Native-picker results stay in drafts keyed by the owning WebContents. Closing the
window invalidates a pending selection; operations from one window are serialized
so repeated mounts/checks do not race the draft. Config save revalidates files,
compares the original configuration, uses a unique sibling temporary file and
renames only on success. A global save lock prevents two windows in this process
from writing simultaneously. This is not a sandbox for untrusted local programs
or a cross-process filesystem transaction against arbitrary external writers.

Personal voice consent remains a separate narration action; trusting a Python
runtime is not consent to clone a speaker. Runtime discovery/configuration does
not authorize an AI request, capture, rendering or publication.
