# Studio 누적 변경 통합·검수 계획

2026-10-14. 작업 브랜치 `fix/studio-export-duration`, 워크트리
`D:/dev/openscreen-studio-export-stability`.

## 보존 기준

기준 커밋은 `e787ad6c9b61610347827ec377dae64873ef3730`이다.
기존 scene-planner 워크트리의 수정·미추적 파일 111개를 모두 복사했고,
파일별 SHA-256과 원래 Git 상태를 보존했다. 원본 프로젝트, GUI 출력 MP4,
승인된 촬영 파일과 이전 개발 워크트리는 수정하지 않았다.

스냅샷은 `D:/purpleprint-build/studio-export-stability-20261014/baseline`에,
111개 파일의 기능별 목록·해시는 같은 폴더 상위의 `change-groups.json`에 있다.
아래 분류는 **검토 단위**다. 각각 독립적으로 빌드되는 커밋이라고 주장하지 않는다.
공용 IPC·메뉴·타입·편집기 상태 변경은 함께 검토해야 한다.

## 기능별 검토 순서

| 순서 | 범위 | 주요 코드 | 기존 변경 파일 수 | 확인할 경계 |
| --- | --- | --- | ---: | --- |
| 1 | 제품 촬영 | `electron/product-demo`, `ProductDemoDialog`, `product-demo`, `demo-framing` | 17 | 허용 URL·행동, 로그인·개인 자료 보호, 촬영 중단·결과 자산 등록 |
| 2 | HyperFrames | `electron/hyperframes`, `tools/hyperframes`, `HyperframesDialog` | 15 | 런타임 발견·설치 안내, 렌더 오류, 승인된 결과만 가져오기 |
| 3 | 나레이션·톤 | `electron/narration`, `tools/narration`, `NarrationDialog`, `narration-export` | 21 | 기본 B/A/중립·추가 지시, 실제 미리 듣기 후 적용, 복제 음성 동의·로컬 처리 |
| 4 | 장면 시트·조립 | `scene-plan`, `ScenePlanDialog`, `ScenePlanFields` | 9 | 기획과 편집 타임라인 분리, 등록 자산·구간 검증, 새 프로젝트 조립 |
| 5 | 애니매틱·재생 | `SceneAnimaticPreview`, `TimelineAudio`, `animatic`, 네이티브 뷰 상태·훅 | 15 | 자막·줌·컷·음성 시계, 임시 뷰 격리, 닫을 때 자원 해제 |
| 6 | 장면 수정·재검수 | `scene-review`, `SceneReviewPanel` | 4 | 전후 비교·명시적 채택·안전한 취소, 내용 변경 시 검수 무효화 |
| 7 | AI 기획 | `electron/scene-planner`, `ScenePlannerPanel`, `scene-planner`, 공급자 재시도 설정 | 11 | 전송 내용 동의, 제한된 JSON, 늦은 응답·취소·프로젝트 변경, 시각 미확인 표시 |
| 8 | 공용 연결·문서 | preload·IPC·타입, 메뉴·편집기·내보내기, 작업·검증 기록 | 19 | 위 기능과 연결 누락, 기존 프로젝트·설치본 호환, 과장 없는 상태 안내 |
| 9 | 이번 출력 안정화 | `pipeline_windows.rs`, `export_timing.rs` | 기준 111개 밖 | 마지막 프레임 길이, 평균 FPS, 픽셀·오디오·원본 보존 |

주요 흐름은 **자료 등록 → 기획안 검토 → 장면 시트 → 애니매틱 → 수정·재검수 →
새 편집 초안 조립 → MP4 확인**이다. AI 기획 채택, 기획 저장, 편집 초안 조립,
나레이션 생성, 영상 게시의 동의를 하나로 합치지 않는다.

## 이번 안정화 결과

후속 자동 검증에서 Windows 음성 워커 환경과 브라우저 음성 인코더 의존성 문제를
발견·수정했다. 사용자에게 화면 조작을 요청하지 않고 격리 앱의 실제 컨트롤로
수정·조립·B/A 생성·재생·적용·재시작 복원·20초 음성 포함 MP4 출력을 확인했다.
QA 앱은 종료했고 컴퓨터 유즈는 사용하지 않았다.
[자동 실행 검증 기록](../technical-documentation/testing/automated-studio-qa-2026-10-14.md).

Windows 네이티브 인코더가 길이를 알 수 없다고 반환한 비디오 패킷에만
출력 1프레임의 길이를 보충한다. 원래 PTS/DTS·알려진 패킷 길이·AAC 경로는
바꾸지 않는다. 실제 19초 초안을 새 네이티브 모듈로 30/60fps 출력해 확인했다.
[재현·검증 기록](../technical-documentation/testing/export-duration-2026-10-14.md).

이 작업은 새 네이티브 모듈을 Node에서 직접 호출한 검사다. QA 앱 화면,
설치·자동 업데이트, 새 PC·Mac 사용 검증을 대신하지 않는다.

## 다음 작업과 배포 기준

1. **통합 후보 정리:** 기능별 실행·저장·동의 경계를 검토하고 촬영 초안의
   저장·취소 및 최종 상태 저장 경합을 수정했다. 기능 기반 코드와 공용 UI 연결을
   의존 순서대로 로컬 커밋에 나누며, 각 중간 트리의 타입 검사를 별도로 수행한다.
   [통합 검토·QA 기록](../technical-documentation/testing/integration-review-2026-10-14.md).
   원격 push·PR·공개 배포는 이번 범위가 아니다.
2. **추가 품질 개선:** 기획안의 근거·수정 이력 보존과 실제 화면에 맞는 구간·줌
   제안은 별도 범위를 합의한다. 현재 AI 기획은 영상 픽셀을 분석하지 않는다.
3. **최종 사용자 흐름 검증:** 격리 앱에서 기획·나레이션·조립·재시작·내보내기를
   다시 확인한다. 컴퓨터 유즈 세션의 실제 종료 방법을 확보하거나, 사용자가
   제약을 알고 허용하기 전에는 화면 조작을 재개하지 않는다.
4. **설치·배포:** 지원 런타임과 오류 안내, Windows 클린 빌드·새 PC 검사,
   설치본 교체·배포 승인을 별도로 받는다. Mac은 별도 검증이 필요하다.

Claude 담당 브랜드 필름 엔진·설계 코치·MCP·랜딩페이지, 현재 설치본, 실제
사용자 프로필은 이번 작업의 변경 대상이 아니다. 추가 AI·음성 생성도 호출하지 않았다.
