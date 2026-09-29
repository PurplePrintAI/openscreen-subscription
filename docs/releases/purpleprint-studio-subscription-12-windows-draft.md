# PurplePrint Studio 1.10.0-subscription.12 — draft

**Windows x64 preview. Not published.** This is an unofficial fork of
[OpenScreen](https://github.com/getopenscreen/openscreen), not an upstream,
OpenAI, or Anthropic release or endorsement. The upstream MIT license and
third-party notices remain included.

## What changes from .11

- The AI session can generate one still-image scene through a connected
  ChatGPT subscription (Codex) while Claude or another provider stays selected
  for conversation. Each generation asks for confirmation and uses subscription
  limits. Studio retains the source image and imports a five-second MP4 clip.
- AI conversations now persist per project across a full app restart, including
  messages, generated-image references, manual compaction state and rewind
  checkpoints. The newest conversation opens on project load.
- A damaged history file is preserved for recovery instead of being replaced
  with an empty conversation. Deleting a project also deletes its saved chats.

## Installation and limits

- The Windows installer is unsigned. Verify the checksum and publisher context
  before choosing whether to run it. Do not disable Windows security controls.
- The official Codex CLI is an optional user-installed dependency; Studio does
  not bundle it, copy account tokens, or guarantee model access. Existing
  API-key and local Claude routes remain available.
- Generated scenes are still images encoded as short video clips. Animation,
  Blender, Hyperframe and Design Coach/MCP project handoff are not included.
- Chats and document checkpoints are local plaintext JSON in Studio's profile;
  provider credentials remain separate. Conversations lost before this update
  cannot be reconstructed because prior builds kept them only in memory.
- There is no macOS or Linux installer in this Windows-only preview. A real Mac
  record/edit/export pass, Developer ID signing and notarization remain open.
- A future-version updater download and installation has not yet been tested.

## Candidate artifact (validation only)

- Owner-tested PR head: e46f551d15569109cc7fc42533cb50b650b211a1.
  The pull-request runner checked out merge commit
  5f61ed82a8a01d16c5e4d457faf0579b07a86f18.
- [Full CI](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36514529135)
  and [clean Windows packaging](https://github.com/PurplePrintAI/openscreen-subscription/actions/runs/36514529127)
  passed. The package validated its native payload, product identity, update
  origin, packaged CLI, license/notices, checksums and unsigned status.
- Installer: PurplePrint-Studio-1.10.0-subscription.12-Windows-x64-Setup.exe
  (245,994,029 bytes).
- SHA-256: AB32A87267E44A924FCD7E6036D6B28F1CAB6CEF7ADB4850ADD6EFF2181BAE2A.
- The installer matches windows-validation.json and SHA256SUMS-Windows.txt.
  Its SHA-512 and byte size also match latest.yml. Authenticode status:
  NotSigned.
- This GitHub Actions artifact is a temporary validation download, not a
  published release or active update feed entry. A later publication build
  needs its own matching checksum and manifest; do not reuse this hash for a
  different installer.

## Validation and remaining gates

- [x] The owner installed this exact .12 candidate after backing up 5,637
  active-profile files. Eight projects, one chat history and two
  generated-scene files remained; all 13 important hashes matched after
  installation and QA project launch. The editor displayed the saved
  two-message conversation and five-second image scene. The owner reported
  a successful MP4 export; this agent did not inspect or decode that file.
- [ ] Copy the verified candidate details into a GitHub release draft, with
  Windows-only and unsigned limitations visible to downloaders.
- [ ] Receive explicit fork-owner approval before publishing a GitHub Release.

## 한국어 요약

Windows x64용 차기 프리릴리즈 초안입니다. ChatGPT 구독 연결을 이용한
이미지 장면 생성과 AI 대화 재시작 복원을 포함합니다. 설치 파일은 미서명이며
Mac 설치 파일은 포함하지 않습니다. 아직 공개 릴리즈가 아닙니다.
