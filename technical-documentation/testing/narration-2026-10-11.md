# Local narration and deployed-demo capture verification

2026-10-11 · Windows development worktree, not a release. Claude's source,
deployment and demo data were not changed.

## Recorded product footage

The owner supplied a deployed read-only demo URL. A sandboxed, isolated Electron
viewer opened that URL without importing browser accounts or credentials. Actual
native clicks, scrolling and document navigation were recorded through the
existing Windows Graphics Capture helper. No slideshow or simulated UI was used.

The document divider was moved before recording from preview x=1543 to x=1203
in a 2305-wide preview. The document pane therefore occupies about 48% of the full
window from the beginning. Original product light theme and typography remain.

Raw take: 239.100 seconds, 2546×1434, H.264, 30 fps container timebase, no audio.
This rate is not a claim of 30 unique captured frames every second. Full decode
passed. A 9-cut visual assembly is 178.000 seconds, 2560×1440 with small padding
instead of UI upscaling. The saved schema-v7 Studio project parsed successfully.
Growth, handoff and the final closing shot are not included yet. The assembly is
not a complete narrated introduction.

The recorder exited normally. The owned viewer was closed and its process was
confirmed absent; the Computer Use kernel was reset immediately after capture.
Unrelated user windows were not targeted.

## Two voice modes

[Runtime and contract](../../tools/narration/README.md).

The owner explicitly requested cloning their own voice and provided four local
recordings (approximately 68 seconds total). Local ASR inspected all four;
reference 02, approximately 16.4 seconds, was used for this clone sample because
its transcript does not depend on an uncertain product name. This is reference
conditioning, not fine-tuning on all four files. Originals were not edited.

The clone and Korean Sohee preset used the same two-sentence script. Weight
downloads accessed public official model snapshots only. Audio inference used
local paths with offline environment flags and network connection calls disabled.
No voice recordings were uploaded. The preset path never reads a personal voice.

| Mode | Audio duration | Generation time, after model load | Peak-clipped samples |
| --- | --- | --- | --- |
| Local reference clone, 0.6B Base | 13.440 s | 42.297 s | 0 |
| Korean Sohee, 0.6B CustomVoice | 11.520 s | 56.968 s | 0 |

Both raw WAVs use 24 kHz mono PCM; comparison copies are loudness-normalized and
resampled to 48 kHz. This does not add source fidelity. Matching 18-second video
examples reuse identical video packets and put narration at +1 second, without
time-stretching either voice. Video and audio both fully decoded successfully.

Local ASR reproduced the clone script after whitespace/punctuation normalization.
For the preset it transcribed `구체화하는` as `구체와 하는`: this may be either
pronunciation or ASR error and needs listening review. Text similarity does not
establish speaker similarity or naturalness. The owner subsequently described the
samples positively; that is not approval of every future generated take.

## Initial standalone proof: code checks and limitations

- Five Python preflight tests passed: mode separation, speaker permission,
  local references, required reference transcript, script bounds and overwrite
  protection. Tests do not download or load models.
- The reusable CLI preset smoke produced a 6-second WAV using offline local
  weights. The initial two comparison samples used the same model API in the
  external production workspace.
- SoX and FlashAttention were absent. A SoX import warning was emitted, but the
  tested ndarray reference and PyTorch SDPA paths completed.
- App-wide tests were not rerun for this separate Python/media proof. No Electron
  source, installed app, user profile, release or Git remote was changed here.
- Windows/CUDA only is verified. Mac/CPU support, runtime installer, cancellation,
  voice selection UI, reference management and persisted narration tracks remain
  product work. Existing CLI audio export is a mix at export time, not a track.

Private artifacts live in the owner's build workspace and are not bundled in the
public repo: original take, edit decision list, `.openscreen`, two voice WAVs,
comparison MP4s, model revisions and validation JSON. Voice similarity must be
approved by the owner before generating the full founder-narrated introduction.

## Studio integration follow-up: actual Windows GUI

The later development integration adds the Narration menu, local reference
transcription, preview, apply/remove, project persistence, playback and GUI MP4
mixing described in [the architecture](../architecture/narration.md). This section
supersedes the initial proof's statement that the voice UI and cancellation are
still unimplemented. No installed release, real user profile or Claude workspace
was changed. Models and reference audio remain outside Git.

An isolated QA profile opened `Narration QA - isolated`: one 18-second actual
product-recording clip, no original audio, schema v7. The QA app used Electron
41.10.7 with all 19 Windows native bundle files hash-matched against the installed
.12 bundle. Native mouse/keyboard actions exercised the app and Windows file
dialogs; no injected renderer clicks or substituted CLI export counted as GUI QA.

Both modes used the short script `퍼플프린트에서 아이디어를 설계로 구체화하세요.`

| Check | Korean preset (Sohee) | Owner's reference clone |
| --- | --- | --- |
| Generated through the app | 6.000 s | 5.040 s after native reference selection and local ASR |
| Preview | Playback advanced from zero to the end; apply enabled after playback started | Same |
| Apply and save | Saved layer with mode, script, audio path, +1 s offset and original gain 0.4 | Same |
| Full app restart | Restored settings and existing audio; replayed to the end | Same; project hash also unchanged across restart |
| Actual GUI export | 1080p / H.264 / 30 fps, success panel | Same |
| Output validation | Full decode passed; narration at 1.000 s, correlation 0.9999704 | Full decode passed; narration at 1.000 s, correlation 0.9999835 |

The two GUI MP4s are 18.005333 seconds with AAC at 48 kHz. Correlation compares
decoded export audio with each generated WAV, not speaker identity or perceptual
quality. The source is silent, so this run verifies persistence of the 40% setting,
not audible ducking against a non-silent source. Trim/speed clock behavior is
covered by unit tests, not this one-clip GUI run.

Private output names and SHA-256:

- `preset-ui-export.mp4`:
  `a06998d43196880780974cc5c1d89982e762564978744fffb3654194a7ecf118`
- `clone-ui-export.mp4`:
  `e33f4c7132645b1557bb7b6eb0c6c40268a1bfc95615e1f051f19fc30c47766a`

WAVs, project snapshots, detailed validation JSON and diagnostics remain in the
owner's private `narration-20261011` build directory. Reopening the saved preset
project through the app's file picker supplied the final preset export; no layer
was inserted through hidden renderer state.

### Defects and remaining release gates

- Fixed Korean detection in the narration, HyperFrames, product-demo dialogs and
  top-bar menu: the real locale is `ko-KR`, not `ko`. The dialog test now uses the
  real locale; all three dialog regression tests and the rebuilt app passed.
- An earlier preset export terminated Electron before producing an MP4. Windows
  recorded exception `0xc0000409` in `electron.exe` at offset `0x563d5a5` on
  2026-10-11 at 19:42 KST. Later clone and preset GUI exports both completed. No
  cause or crash fix has been established; successful retries do not close this
  stability issue. Earlier intermittent black editor startup is likewise not
  claimed fixed by diagnostic logging.
- Independent CLI renders also passed while investigating the failure, but are
  separate evidence and do not replace the GUI results above. Successful native
  runs selected Intel QSV after AMF/NVENC were unavailable on this machine.
- Integration checks already passed: 201 unit-test files, 2,323 tests passed and
  5 skipped; app and test TypeScript configs; five Python preflight tests; docs
  checks and Vite build. Real service validation additionally exercised both
  models, reference transcription and worker cancellation.
- Runtime/model installation UX, macOS support, long-form narration, portable
  packing and the intermittent native crash still need work before release.

At the end of GUI verification the owned QA app quit normally (quit lifecycle
logged), its processes were checked absent, and the Computer Use kernel was reset
immediately. No QA window was left holding the user's desktop.
