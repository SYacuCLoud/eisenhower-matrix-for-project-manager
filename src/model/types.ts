import type { PriorityConfig, StatusConfig } from '../pm/pmTypes'

export type TaskType = 'task' | 'milestone' | 'subtask'

/**
 * 매트릭스가 필요로 하는 최소 작업 정보. PM 의 `Task` 와 달리 트리도 본문도 없다
 * (본문을 읽으면 파일당 디스크 I/O 가 발생하고, 카드에 쓸 일도 없다).
 */
export interface MatrixTask {
  /** 프론트매터 `id`. 없으면 '' — 이동은 filePath 로 처리한다. */
  id: string
  filePath: string
  title: string
  type: TaskType
  status: string
  priority: string
  /** 'YYYY-MM-DD' 또는 '' */
  start: string
  /** 'YYYY-MM-DD' 또는 '' */
  due: string
  progress: number
  completed: string
  tags: string[]
  assignees: string[]
  projectId: string
  parentId: string | null
  /** 경로에 Archive 세그먼트가 있으면 true */
  archived: boolean
  mtime: number
  /** rollup 보기에서 이 카드에 합쳐진 하위 작업 수. 저장 필드가 아니다. */
  rolledUpSubtaskCount?: number
  /** rollup 검색에만 쓰는 하위 작업 제목·태그·담당자. */
  rolledUpSearchText?: string
  rolledUpTags?: string[]
  rolledUpAssignees?: string[]
  /** 분면은 부모 기준으로 유지하고, 하위 상태는 정보 배지로 집계한다. */
  rolledUpUrgentCount?: number
  rolledUpImportantCount?: number
  rolledUpCompletedCount?: number
}

export interface ProjectMeta {
  id: string
  title: string
  filePath: string
  color: string
  icon: string
}

export type QuadrantId = 'do' | 'plan' | 'delegate' | 'drop'

export const QUADRANT_ORDER: readonly QuadrantId[] = ['do', 'plan', 'delegate', 'drop']

export type SortMode = 'due' | 'priority' | 'title' | 'updated'

export type SubtaskMode = 'flat' | 'rollup' | 'hide'

export interface MatrixFilter {
  text: string
  /** [] = 전체 */
  projectIds: string[]
  showCompleted: boolean
  showArchived: boolean
  tags: string[]
  assignees: string[]
}

/** 분류에 필요한 모든 것. `today` 는 주입값이라 테스트에서 고정할 수 있다. */
export interface ClassifyContext {
  /** 'YYYY-MM-DD' */
  today: string
  urgencyWindowDays: number
  importantIds: ReadonlySet<string>
  statuses: readonly StatusConfig[]
  priorities: readonly PriorityConfig[]
}

export type WritableField = 'due' | 'priority' | 'start'

export interface FieldChange {
  field: WritableField
  before: string
  after: string
  reason: string
}

export interface QuadrantWritePlan {
  filePath: string
  taskId: string
  title: string
  from: QuadrantId
  to: QuadrantId
  /** 비어 있으면 할 일이 없다. */
  changes: FieldChange[]
}
