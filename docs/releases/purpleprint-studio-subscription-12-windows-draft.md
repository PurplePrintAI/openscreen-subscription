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

## Verification required before publication

- [ ] Clean Windows x64 package from the merged source, with native payload,
  package identity, update origin, CLI boot, license/notices and unsigned status
  checks passing.
- [ ] Record the exact source commit, CI run, installer byte size, SHA-256 and
  latest.yml values in these notes and the GitHub release draft.
- [ ] Verify the owner-installed .12 candidate preserves the active profile.
  Earlier .11 development candidates passed an image-scene import/export test
  and a one-turn Claude conversation restore test, but that is not .12 package
  validation.
- [ ] Receive explicit fork-owner approval before publishing a GitHub Release.

## 한국어 요약

Windows x64용 차기 프리릴리즈 초안입니다. ChatGPT 구독 연결을 이용한
이미지 장면 생성과 AI 대화 재시작 복원을 포함합니다. 설치 파일은 미서명이며
Mac 설치 파일은 포함하지 않습니다. 아직 공개 릴리즈가 아닙니다.
