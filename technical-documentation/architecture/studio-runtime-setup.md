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
  Preset speech needs only Python and CustomVoice. Base and faster-whisper are
  an optional pair for cloning; disconnecting that pair only removes saved paths.
  Narration reports preset and clone availability independently.
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

Narration saves `narration-runtime.json` in userData; `cloneModel` and
`whisperModel` are optional when only preset speech is used.
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
support. Fresh-PC and driver compatibility still require separate verification.
The separately confirmed installer supports a dedicated environment as well as
manually prepared Python.

## Preset-model installer

**Install / reuse preset voice model** opens a separate dialog after any setup
draft is saved/discarded. Existing-Python mode requires Windows x64, a trusted
prepared Python 3.12 with qwen-tts, soundfile and CUDA-enabled PyTorch, and a
BF16-capable NVIDIA GPU. Dedicated mode can prepare Python/packages. CPU/Mac
and GPU-driver installation are not supported. Basic editing is unaffected.

The user selects a native Python executable and a local destination (for
download) or existing model folder (for reuse). Trust acknowledgement permits
an offline probe, not a download. A main-owned 15-minute plan shows the pinned
Qwen3-TTS-12Hz-1.7B-CustomVoice revision, destination, byte count, free space and
GPU report. The 12-file snapshot is 4,520,217,432 bytes; a new installation also
reserves 512 MiB working headroom. Reuse has zero download bytes and verifies
every manifest file. Neither mode loads weights or proves audio generation.

A separate confirmation consumes the plan. Downloads use only the bundled
manifest and HTTPS Hugging Face/CDN destinations, no user token or remote script.
Transfers are bounded by bytes, idle/total timeouts and SHA-256. A unique sibling
staging directory is verified before promotion; existing directories are never
replaced. Configuration linking rechecks its baseline and preserves clone paths.
Cancellation removes only owned staging files. A fully verified model stays
reusable if subsequent configuration linking fails. Retry starts over; there is
no partial-download resume. Weight downloads are not part of voice generation.

`studio:narration-install` accepts actions/field names and opaque plan IDs, not
renderer-supplied paths, model URLs, commands or configuration. Only trusted
editor main frames may call it. One installation/diagnostic runs at a time;
status/cancel remain responsive. Owner destruction aborts work; normal app quit
waits for the owned job to clean up. The trusted local Python is executed without
a shell or inherited provider credentials and disables network connections in
its diagnostic script. This is not a sandbox for a malicious local executable.

## Dedicated Python and packages

Dedicated mode selects a storage directory instead of requiring a Python path.
An explicit local diagnostic runs the driver's native `nvidia-smi`, restricted to
known Windows locations. GPU 0 must report compute capability >= 8 and >= 7,680 MiB
VRAM (approximately an 8 GB card). Driver compatibility and actual allocation are
checked again after installation, not guaranteed by this initial device report.

`runtime-manifest.json` pins Astral's Python 3.12.15 standalone distribution,
PyTorch/torchaudio 2.11.0+cu128 and the complete 89-wheel Qwen preset dependency
closure. Versions, URLs, sizes and SHA-256 are bundled; the client does not resolve
packages from a live index. The small BSD-licensed SoX Python wrapper is bundled
as a wheel because its upstream release is source-only. Its license and source
provenance are retained. No source build runs on the user's PC.

The reviewed plan includes all runtime/model download bytes and 14 GiB of working
headroom. Existing model reuse needs about 2.98 GB of runtime downloads; a new model
adds 4.52 GB. A separate confirmation authorizes these downloads, installation of
trusted executables/packages, GPU use and a fixed non-private Korean test sentence.

Each attempt creates a unique `PurplePrint-Runtime-<plan-id>` directory under the
selected storage root. Python is extracted with a bounded parser that rejects
links, traversal, Windows device/ADS names and case aliases. A venv is created
from that new interpreter; it does not see the user's system/user site-packages.
Offline pip consumes only hash-pinned wheels with no index, dependency resolution,
source builds or cache writes. PATH, registry, existing Python and other apps are
not changed. Downloads are removed after package checks succeed.

The new environment must pass Python/GPU diagnostics and generate a valid test
WAV before configuration is connected. The UI then offers the sample for preview;
ordinary narration still requires preview before applying a generated take.
The cold-start diagnostic has a five-minute bound, package installation fifteen
minutes and speech generation ten minutes. Existing-Python diagnostics retain
their shorter bound. Stage/error reports stay in app-local narration diagnostics;
they are never sent to a provider or included automatically in public reports.

Failure/cancellation preserves the previous configuration and external models
and removes only the newly owned runtime. Config conflicts are rechecked before
atomic linking. Retry starts over and can require downloading the runtime again;
there is no resumable package cache or successful-runtime deletion/update UI.
This installs trusted software, not a sandbox for malicious local programs.

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
