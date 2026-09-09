# TODO

향후 기능 후보입니다. 구현 순서는 확정되지 않았습니다.

## dotpm 2.3.1 호환 대응

2026-09-09 기준 `C:\_MD Docs\.obsidian\plugins\project-manager`에 설치된 dotpm 2.3.1의 manifest와 번들을 기존 연동 코드와 비교했다. 같은 날 편집·갱신 호환 계층과 표시 명칭·문서 항목을 구현하고 단위 테스트·타입 검사·빌드를 통과시켰다. 실제 Obsidian에서의 동작 검증과 배포는 아직 하지 않았다(아래 검증 및 배포 항목).

### 유지해야 하는 식별자

- 내부 플러그인 ID는 `project-manager`를 유지한다.
- 프론트매터 키 `pm-task`, `pm-project`를 유지한다.
- 확인한 `.pm-*` 카드·모달 선택자는 새 번들에도 존재한다. 이름 변경만을 이유로 치환하지 않는다.
- 이 추가 플러그인의 ID와 설치 폴더 `eisenhower-matrix-for-project-manager`는 유지해 기존 설정과 연결을 보존한다.
- `pm`을 `dotpm`으로 일괄 치환하지 않는다.

### 우선: 편집·갱신 호환 계층

- [x] `src/pm/taskEditorBridge.ts`의 `tryOpenTaskEditorFromProjectView`를 새 편집 경로에 맞춘다. 기존 `subview.handleKeyDown`은 설치 번들에서 발견되지 않았다. 접힌 작업·필터로 숨긴 작업·가상 스크롤 밖의 작업도 편집할 수 있는 경로를 확인한다.
  - 2.3.1의 키 처리는 Obsidian `Scope`로 옮겨가 subview 메서드로 남지 않았다. 대신 `projectScope.taskById()`로 작업 객체를 찾아 Board(kanban) subview의 `openTask(task)`를 호출한다(카드 클릭과 같은 경로, 표시 여부 무관). 현재 뷰가 Board가 아니면 잠시 전환 후 복원한다. `projectScope`가 없는 1.8.x는 기존 TableView Enter 경로를 그대로 쓴다.
- [x] `ensureProjectViewTask`의 프로젝트 뷰 갱신을 점검한다. 새 뷰는 `loadScope()`를 사용하므로 기존 `view.loadProject()` 가정에 대한 대응이 필요하다.
  - `loadScope` → `loadProject` 순으로 존재하는 것을 호출한다. 작업 존재 확인은 `projectScope.projectOf()`(다중 프로젝트 범위 포함) 뒤 `view.project`(2.x에서는 읽기 전용 getter) 순으로 본다.
- [x] 삭제 전 및 편집 재시도 시 캐시 갱신 방법을 확인한다. 기존 `store.invalidateForPath()`는 설치 번들에서 발견되지 않았다. 대체 API의 동작을 확인한 뒤 적용한다.
  - 2.3.1의 `store.reloadProject(path)`는 디스크에서 다시 읽어 캐시된 프로젝트 객체를 `adopt()`로 제자리 갱신한다(이미 든 참조도 새로워짐). `reloadProject` → `invalidateForPath` 순으로 존재하는 것을 쓴다. `deleteTask`는 두 세대 모두 대상이 없어도 예외 없이 끝나므로 거짓 성공 방지 검사를 유지했다.
- [x] 작업 생성의 화면 이동 방지 로직을 `taskEditorSurface: 'modal' | 'tab'`에 맞춘다. 현재 볼트 설정은 `modal`이며, 기존 로직은 `.pm-modal--task`를 관찰한다. 탭 편집기는 `router.openTask` 경로를 사용한다.
  - `openTaskModalForProject(project, parentId, defaults)`는 2.3.1에도 같은 시그니처로 있고 `due`/`priority` 기본값을 새 작업에 그대로 펼친다. modal이면 기존 `router.openProjectByPath` 가드를 유지하고, tab이면 dotpm이 저장 콜백을 쓰지 않으므로 가드를 두지 않는다.
- [x] `src/views/MatrixView.ts`의 작업 편집·생성·삭제 호출부를 새 호환 계층과 함께 점검한다. 기존 매트릭스 화면 유지 동작과 dotpm의 편집기 설정이 어떻게 함께 동작할지 정한다.
  - 결정: dotpm의 편집기 설정을 그대로 따른다. modal이면 종전처럼 숨은 프로젝트 leaf로 매트릭스 위에 모달을 띄우고, tab이면 `tryOpenTaskEditorInTab`이 dotpm과 같은 `router.openTask({ filePath })`로 편집기 탭을 열어 전환한다(모달로 강제하지 않음). 순서는 공개 API → 탭 경로 → DOM 클릭 → Board/TableView 내부 경로 → 캐시 갱신 후 재시도.
- [x] 구버전 지원 범위를 정하고, 지원하는 버전별로 기능 존재 여부를 확인하는 분기를 둔다. 내부 API를 공개 API로 가정하지 않는다.
  - 지원 범위: dotpm 2.3.x(번들 확인)와 Project Manager 1.8.x(기존 경로 유지). `detectPmIntegration()`이 `reloadProject`/`router.openTask` → `dotpm-2`, `invalidateForPath` → `pm-1`, 그 외 `unknown`으로 나누되 실제 분기는 각 함수에서 기능 존재 여부로 한다. 버전 문자열은 설정 화면 표시에만 쓴다.

### 표시 명칭과 문서

- [x] `src/i18n/ko.ts`의 메뉴·알림·설정 안내에서 제품명을 dotpm으로 갱신한다. `pluginName`은 플러그인 자체 이름이므로 유지. 연동 상태에 dotpm 버전과 편집기 설정 표시 추가.
- [x] `manifest.json`, `package.json`의 표시 이름·설명을 검토한다. 내부 ID와 패키지 식별자 변경은 별도 마이그레이션 없이 진행하지 않는다. 설명만 `dotpm(구 Project Manager)`로 갱신하고 이름·ID·패키지명은 유지.
- [x] `README.md`의 제품명·링크·설치 안내·호환성 설명을 갱신한다. 특히 Project Manager 1.8.0 기준의 편집·생성 API 설명을 재검토한다. 지원 버전 표와 편집기 설정(모달/탭) 동작 설명 추가.
- [x] 호환 계층의 주석과 로그에서 구버전 전용 설명과 현재 지원 내용을 구분한다.

### 검증 및 배포

- [ ] 상태·우선순위 설정 읽기와 `pm-task` / `pm-project` 인덱싱을 확인한다.
- [ ] 일반 작업과 마일스톤의 편집, 숨겨진 작업의 편집, 작업 생성 직후 재편집을 검증한다.
- [ ] 모달·탭 편집기 설정 각각에서 생성 기본값과 저장 후 화면 이동을 확인한다.
- [ ] 삭제 시 하위 작업과 프로젝트 관계가 정리되고, 오래된 캐시에서도 성공 여부를 정확하게 판정하는지 검증한다.
- [ ] 마일스톤 전용 영역과 사분면 이동 제한이 유지되는지 확인한다.
- [x] 변경한 호환 경로의 회귀 테스트, 타입 검사, 전체 테스트, 빌드를 실행한다. (2026-09-09, `test/taskEditorBridge.test.ts`에 2.x 경로 테스트 추가)
- [x] 기존 배포 파일을 백업하고 `main.js`, `styles.css`, `manifest.json`을 배포한다. (2026-09-09 13:09, 백업 `.deploy-backups/20260909-130952`, 대상 `C:\_MD Docs\.obsidian\plugins\eisenhower-matrix-for-project-manager`. Obsidian 동작 검증은 아래 항목대로 배포 후 진행)

## 4분면 카드 비율 및 레이아웃 개선

현재 카드는 각 분면 너비를 모두 채우는 세로 1열 구조라 가로로 지나치게 긴 띠처럼 보인다. 4분면 구조는 유지하면서, 각 분면 내부를 반응형 카드 그리드로 개선한다.

2026-09-09 구현·배포. 실제 화면 확인 항목은 아래에 미체크로 남긴다.

- [x] 넓은 분면에서는 카드를 2열로 배치하고, 창이나 패널이 좁아지면 1열로 전환한다. 전환 기준은 실제 분면의 가용 너비로 정한다.
  - `.eis-cards`를 `grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr))` 그리드로 변경. 미디어 쿼리 없이 분면 실제 너비로 열 수가 정해진다.
- [x] 카드 너비 약 300~360px, 최소 높이 130~150px를 시작점으로 비율을 조정한다. 정사각형보다는 살짝 가로로 긴 형태를 사용하고, 내용이 많으면 높이가 자연스럽게 늘어나도록 한다.
  - 최소 너비 300px, 최소 높이 7.5rem(≈120px). `--eis-card-min-width`, `--eis-card-min-height` 변수로 조정 가능. 간결 카드는 최소 높이를 두지 않는다. 1080p에서 마일스톤 띠가 있을 때 2행이 스크롤 없이 들어가도록 140px에서 낮추고 내부 여백을 줄였다(2026-09-09).
- [x] 카드가 하나뿐이어도 넓은 분면 전체로 늘어나지 않고 한 칸 너비를 유지한다. (`auto-fill`이 빈 트랙을 유지)
- [x] 프로젝트명은 상단, 작업 제목은 가운데, 날짜·우선순위는 하단에 배치해 정보 위계를 정리한다. 마감 임박·기한 초과 등의 상태 표시도 유지한다.
  - 카드 본문을 세로 flex로 바꾸고 상단 행(`eis-card-header`)에 프로젝트명(왼쪽)과 상태 배지(오른쪽), 가운데 제목(남는 높이를 채움), 하단 메타(마감일·우선순위·태그). 기존 상세 카드의 프로젝트 칩은 상단 행으로 대체.
- [x] 카드 그림자를 줄이고 간격과 내부 여백을 정리해 여러 카드가 모여 있어도 과도하게 무겁지 않게 표현한다. (기본 상태 그림자 제거, hover 시에만 `--shadow-s`)
- [ ] 현재 화면 기준 약 350 × 140px를 시안으로 확인한다. 작업 4개가 2×2로 배치될 때의 가독성과 분면 내부 스크롤을 점검한다.
- [ ] 긴 제목, 메타데이터가 많은 작업, 카드 0개·1개·여러 개, 좁은 패널에서의 표시와 기존 카드 클릭·드래그 이동 동작을 검증한다.

## 프로젝트 간 일정 충돌 표시

- 여러 프로젝트의 긴급 작업이 같은 날짜나 짧은 기간에 집중된 상황을 탐지한다.
- 날짜별 작업 집중도와 처리 가능량 초과 여부를 보여준다.
- 처리 가능량은 사용자가 직접 설정하며, 예상 소요 시간이 없을 때는 작업 개수를 기준으로 계산한다.
- 충돌한 작업에서 해당 Project Manager 작업 편집 화면으로 바로 이동할 수 있게 한다.

## 주간 의사결정 리포트

- 완료한 중요 작업, 계속 미뤄진 작업, 새로 긴급해진 작업을 요약한다.
- 다음 주에 미리 계획할 작업과 위임·보류·제거 검토 대상을 제안한다.
- 통계 나열보다 사용자가 검토하고 결정해야 할 항목을 우선한다.
- 리포트는 Vault 내부 Markdown 문서로 생성하거나 복사할 수 있게 한다.
