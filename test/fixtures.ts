import { importantIdsForThreshold } from '../src/model/classify'
import type { ClassifyContext, MatrixTask } from '../src/model/types'
import { FALLBACK_PRIORITIES, FALLBACK_STATUSES } from '../src/pm/pmTypes'

export const TODAY = '2026-08-07'

export function makeMatrixTask(overrides: Partial<MatrixTask> = {}): MatrixTask {
  return {
    id: 'task-1',
    filePath: 'Projects/demo_tasks/task-1.md',
    title: '테스트 작업',
    type: 'task',
    status: 'todo',
    priority: 'medium',
    start: '',
    due: '',
    progress: 0,
    completed: '',
    tags: [],
    assignees: [],
    projectId: 'proj-1',
    parentId: null,
    archived: false,
    mtime: Date.parse(`${TODAY}T00:00:00Z`),
    ...overrides
  }
}

export function makeCtx(overrides: Partial<ClassifyContext> = {}): ClassifyContext {
  const priorities = overrides.priorities ?? FALLBACK_PRIORITIES
  return {
    today: TODAY,
    urgencyWindowDays: 3,
    statuses: FALLBACK_STATUSES,
    priorities,
    importantIds: importantIdsForThreshold(priorities, 'high'),
    ...overrides
  }
}

/** 프론트매터 리터럴 (인덱스/쓰기 테스트용). */
export function makeTaskFm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'pm-task': true,
    projectId: 'proj-1',
    parentId: null,
    id: 'task-1',
    title: '테스트 작업',
    type: 'task',
    status: 'todo',
    priority: 'medium',
    start: '',
    due: '',
    progress: 0,
    assignees: [],
    tags: [],
    subtaskIds: [],
    dependencies: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

export function makeProjectFm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'pm-project': true,
    id: 'proj-1',
    title: '데모 프로젝트',
    color: '#8b72be',
    icon: '📋',
    taskIds: [],
    ...overrides
  }
}
