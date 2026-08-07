/** 사용자에게 보이는 모든 문자열. 코드에 문자열 리터럴을 직접 쓰지 않는다. */
export const KO = {
  pluginName: 'Eisenhower Matrix for Project Manager',
  viewTitle: '아이젠하워 매트릭스',

  quadrant: {
    do: { title: '긴급 · 중요', subtitle: '즉시 실행' },
    plan: { title: '중요', subtitle: '일정 계획' },
    delegate: { title: '긴급', subtitle: '위임' },
    drop: { title: '긴급하지도 중요하지도 않음', subtitle: '제외 검토' }
  },

  empty: {
    do: '급한 불이 없습니다.',
    plan: '계획된 작업이 없습니다.',
    delegate: '해당 작업이 없습니다.',
    drop: '해당 작업이 없습니다.',
    all: 'pm-task 프론트매터를 가진 작업 노트를 찾지 못했습니다.',
    allFiltered: '필터 조건에 맞는 작업이 없습니다.',
    openSettings: '설정 열기',
    resetFilter: '필터 초기화'
  },

  toolbar: {
    searchPlaceholder: '검색…',
    project: '프로젝트',
    projectAll: '전체',
    projectNone: '(프로젝트 없음)',
    sort: '정렬',
    showCompleted: '완료 표시',
    showArchived: '보관 표시',
    reset: '초기화',
    refresh: '새로고침',
    filterActive: '필터 적용 중'
  },

  sort: {
    due: '마감일',
    priority: '우선순위',
    title: '제목',
    updated: '수정일'
  },

  card: {
    milestone: '마일스톤',
    noProject: '(프로젝트 없음)',
    openTask: (title: string) => `${title} 작업 편집 열기`,
    more: (n: number) => `외 ${n}개 더 있음`,
    archived: '보관됨',
    subtasks: (n: number) => `하위 ${n}`,
    rollupUrgent: (n: number) => `긴급 ${n}`,
    rollupImportant: (n: number) => `중요 ${n}`,
    rollupCompleted: (n: number) => `완료 ${n}`
  },

  menu: {
    moveTo: '사분면 이동',
    openProject: 'Project Manager에서 열기',
    openNote: '실제 노트 열기',
    undo: '되돌리기'
  },

  banner: {
    pmMissing: 'Project Manager 플러그인을 찾을 수 없어 기본 상태/우선순위 설정을 사용합니다.',
    dismiss: '닫기'
  },

  confirm: {
    title: '사분면 이동',
    body: (taskTitle: string, quadrant: string) => `"${taskTitle}" 작업을 「${quadrant}」로 이동합니다.`,
    colField: '항목',
    colBefore: '현재',
    colAfter: '변경 후',
    fieldDue: '마감일',
    fieldPriority: '우선순위',
    fieldStart: '시작일',
    emptyValue: '(없음)',
    dontAskAgain: '다음부터 확인하지 않기',
    cancel: '취소',
    apply: '적용'
  },

  notice: {
    noChanges: '변경할 내용이 없습니다.',
    sameQuadrant: '같은 사분면입니다.',
    moved: (taskTitle: string) => `"${taskTitle}" 이동 완료`,
    undone: (taskTitle: string) => `"${taskTitle}" 이동을 되돌렸습니다.`,
    undoLabel: '되돌리기',
    refreshed: '매트릭스를 새로 읽었습니다.',
    archivedNoDrag: '보관된 작업은 이동할 수 없습니다.',
    completedNotUrgent: '완료된 작업은 긴급 분면으로 이동할 수 없습니다.',
    pmTaskEditorFallback:
      'Project Manager 작업 편집기를 열지 못해 실제 작업 노트를 열었습니다.'
  },

  error: {
    missing: '작업 파일을 찾을 수 없습니다. 매트릭스를 새로고침합니다.',
    notATask: 'Project Manager 작업 파일이 아닙니다.',
    stale: '파일이 다른 작업으로 교체되어 이동을 취소했습니다.',
    conflict: '다른 곳에서 이미 변경되어 이동을 취소했습니다.',
    write: '작업을 저장하지 못했습니다. 콘솔을 확인하세요.',
    undoFailed: '되돌릴 수 없습니다. 파일이 변경되었습니다.',
    generic: '작업을 처리하지 못했습니다. 콘솔을 확인하세요.'
  },

  command: {
    open: '아이젠하워 매트릭스 열기',
    refresh: '매트릭스 새로고침',
    undo: '마지막 사분면 이동 되돌리기',
    toggleCompleted: '완료된 작업 표시 전환',
    moveActive: '현재 노트를 사분면으로 이동'
  },

  settings: {
    sectionClassify: '분류 기준',
    urgencyWindow: '긴급 기준 일수',
    urgencyWindowDesc: "마감일이 오늘부터 N일 이내이거나 이미 지난 작업을 '긴급'으로 봅니다.",
    importantThreshold: '중요 기준 우선순위',
    importantThresholdDesc: "이 우선순위 이상을 '중요'로 봅니다.",
    subtaskMode: '하위 작업 처리',
    subtaskModeDesc: '하위 작업을 개별 카드로 볼지, 상위 작업으로 합칠지 정합니다.',
    subtaskFlat: '개별 표시',
    subtaskRollup: '상위 작업으로 합치기',
    subtaskHide: '숨기기',

    sectionDisplay: '표시',
    showCompleted: '완료된 작업 표시',
    showArchived: '보관된 작업 표시',
    maxCards: '사분면당 최대 카드 수',
    maxCardsDesc: '카드가 너무 많을 때 렌더링 속도를 지킵니다.',
    sortMode: '기본 정렬',

    sectionDrag: '드래그 동작',
    confirmOnDrop: '이동 전 확인 창 표시',
    urgentDueStrategy: "'긴급'으로 이동 시 마감일",
    urgentToday: '오늘',
    urgentTomorrow: '내일',
    urgentWindowEdge: '기준일 마지막 날',
    notUrgentStrategy: "'긴급 아님'으로 이동 시",
    notUrgentPush: '마감일 미루기',
    notUrgentClear: '마감일 지우기',
    notUrgentPadding: '미루기 여유 일수',
    notUrgentPaddingDesc: (days: number) => `현재 설정: 오늘 + ${days}일`,
    keepStartBeforeDue: '마감일보다 늦은 시작일 함께 조정',
    keepStartBeforeDueDesc: '새 마감일이 시작일보다 빠르면 시작일도 같이 당깁니다.',

    sectionIntegration: '연동 상태',
    pmStatus: 'Project Manager 연동',
    pmStatusOn: (s: number, p: number) => `사용 중 — 상태 ${s}개, 우선순위 ${p}개를 PM 설정에서 읽었습니다.`,
    pmStatusOff: '없음 — 기본값을 사용합니다.',
    safetyNote: '안전 규칙',
    safetyNoteDesc:
      '이 플러그인은 작업 파일의 마감일·우선순위·시작일만 수정하며 본문과 다른 필드는 절대 건드리지 않습니다.'
  }
} as const
