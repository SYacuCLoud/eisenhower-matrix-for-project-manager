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
    filterActive: '필터 적용 중',
    density: '카드'
  },

  density: {
    compact: '간결',
    default: '기본',
    detailed: '상세'
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
    rollupCompleted: (n: number) => `완료 ${n}`,
    blockedStatus: '차단됨',
    futureStart: (date: string) => `${date} 시작`,
    urgencyOverdue: '기한 초과',
    urgencyToday: '오늘 마감',
    urgencySoon: '마감 임박',
    neglected: (days: number) => `${days}일 방치`,
    missingDue: '마감일 없음',
    start: (date: string) => `시작 ${date}`,
    progress: (value: number) => `진행 ${value}%`
  },

  unavailable: {
    title: '지금 실행할 수 없음',
    subtitle: '차단 상태 또는 시작일 전',
    empty: '실행을 막는 작업이 없습니다.'
  },

  briefing: {
    title: (n: number) => `달라진 작업 ${n}개`,
    subtitle: '이전 확인 이후 우선순위와 실행 상태가 바뀌었습니다.',
    dismiss: '모두 확인',
    more: (n: number) => `외 ${n}개 변화`,
    change: (kind: string, before: string, after: string) => `${kind}: ${before} → ${after}`,
    neglected: '방치 위험으로 전환',
    kind: {
      quadrant: '분면',
      availability: '실행 상태',
      urgency: '긴급도',
      priority: '우선순위'
    },
    value: {
      available: '실행 가능',
      'blocked-status': '차단됨',
      'future-start': '시작일 전',
      none: '여유',
      soon: '마감 임박',
      today: '오늘 마감',
      overdue: '기한 초과'
    }
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
      'Project Manager 작업 편집기를 열지 못해 실제 작업 노트를 열었습니다.',
    noProjects: '작업을 추가할 Project Manager 프로젝트가 없습니다.',
    createTaskFallback: '기본값을 미리 채우지 못해 Project Manager의 일반 작업 추가 창을 열었습니다.'
  },

  quadrantAction: {
    addTask: (quadrant: string) => `${quadrant}에 작업 추가`,
    chooseProject: '프로젝트 선택'
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
    separateUnavailable: '실행 불가능한 작업 분리',
    separateUnavailableDesc: 'Blocked 상태와 미래 시작일 작업을 사분면 위의 별도 영역에 표시합니다.',
    showUrgencyLevels: '긴급도 단계 표시',
    showUrgencyLevelsDesc: '긴급 작업을 기한 초과·오늘 마감·마감 임박으로 구분합니다.',
    detectNeglected: '방치된 중요 작업 탐지',
    detectNeglectedDesc: '오랫동안 수정되지 않은 중요 작업에 방치 배지를 표시합니다.',
    neglectedAfter: '방치 판정 일수',
    neglectedAfterDesc: '마지막 수정 이후 이 기간이 지나면 방치된 것으로 봅니다.',

    sectionDisplay: '표시',
    showCompleted: '완료된 작업 표시',
    showArchived: '보관된 작업 표시',
    maxCards: '사분면당 최대 카드 수',
    maxCardsDesc: '카드가 너무 많을 때 렌더링 속도를 지킵니다.',
    sortMode: '기본 정렬',
    showTransitionBriefing: '분면 이동 브리핑',
    showTransitionBriefingDesc: '이전 확인 이후 분면·긴급도·실행 상태가 달라진 작업을 보여줍니다.',

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
      '분면 이동은 마감일·우선순위·시작일만 수정합니다. 새 작업은 Project Manager의 생성 창과 저장 경로를 사용합니다.'
  }
} as const
