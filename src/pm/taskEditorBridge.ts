export interface PmTaskEditorRequest {
  projectPath: string
  taskId: string
  taskPath: string
}

interface PmTaskEditorApi {
  hasCapability?: (capability: string) => boolean
  openTaskEditor?: (request: PmTaskEditorRequest) => unknown | Promise<unknown>
}

/**
 * Project Manager가 향후 공개 API를 제공하면 DOM 호환 계층보다 먼저 사용한다.
 * capability 함수가 있는 API는 명시적으로 task-editor.open을 지원해야 한다.
 */
export async function tryOpenTaskEditorApi(
  plugin: unknown,
  request: PmTaskEditorRequest
): Promise<boolean> {
  if (!plugin || typeof plugin !== 'object') return false
  const api = (plugin as { api?: unknown }).api
  if (!api || typeof api !== 'object') return false
  const candidate = api as PmTaskEditorApi
  if (
    typeof candidate.openTaskEditor !== 'function' ||
    typeof candidate.hasCapability !== 'function'
  ) {
    return false
  }
  try {
    if (!candidate.hasCapability('task-editor.open')) {
      return false
    }
    const result = await candidate.openTaskEditor.call(api, request)
    return result !== false
  } catch (error) {
    console.warn('[EIS] Project Manager 작업 편집 API 호출에 실패했습니다.', error)
    return false
  }
}

interface PmTaskLike {
  id?: unknown
  subtasks?: unknown
}

interface PmTableSubviewCompat {
  state?: { selectedTaskId?: string | null }
  handleKeyDown?: (event: KeyboardEvent) => void
}

interface PmProjectViewCompat {
  currentView?: unknown
  filter?: Record<string, unknown>
  project?: { tasks?: unknown; taskIndex?: unknown } | null
  subview?: PmTableSubviewCompat | null
  renderCurrentView?: () => void
}

/**
 * PM 1.8.x 호환 경로. 필터를 저장하지 않고 메모리에서만 잠시 해제한 TableView의
 * 편집 키 동작을 호출하므로 접힘·필터·가상 스크롤 밖의 작업도 열 수 있다.
 */
export function tryOpenTaskEditorFromProjectView(
  rawView: unknown,
  taskId: string,
  makeKeyboardEvent: () => KeyboardEvent = () => new KeyboardEvent('keydown', { key: 'Enter' })
): boolean {
  if (!rawView || typeof rawView !== 'object') return false
  const view = rawView as PmProjectViewCompat
  if (!projectHasTask(view.project, taskId) || typeof view.renderCurrentView !== 'function') {
    return false
  }

  const originalMode = view.currentView
  const originalFilter = cloneFilter(view.filter)
  try {
    view.currentView = 'table'
    if (view.filter) {
      Object.assign(view.filter, {
        text: '',
        statuses: [],
        priorities: [],
        assignees: [],
        tags: [],
        dueDateFilter: 'any',
        showArchived: true
      })
    }
    view.renderCurrentView()
    const subview = view.subview
    if (!subview?.state || typeof subview.handleKeyDown !== 'function') return false
    subview.state.selectedTaskId = taskId
    subview.handleKeyDown(makeKeyboardEvent())
    return true
  } catch (error) {
    console.warn('[EIS] Project Manager 1.8 호환 편집 경로에 실패했습니다.', error)
    return false
  } finally {
    view.currentView = originalMode
    if (view.filter && originalFilter) replaceFilter(view.filter, originalFilter)
    try {
      view.renderCurrentView()
    } catch {
      // PM 내부 구조가 바뀐 경우 원래 화면 복원 실패가 편집기 폴백을 막지 않게 한다.
    }
  }
}

function projectHasTask(project: PmProjectViewCompat['project'], taskId: string): boolean {
  if (!project) return false
  if (project.taskIndex instanceof Map && project.taskIndex.has(taskId)) return true
  if (!Array.isArray(project.tasks)) return false
  const pending = [...project.tasks]
  const seen = new Set<unknown>()
  while (pending.length > 0) {
    const value = pending.pop()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    const task = value as PmTaskLike
    if (task.id === taskId) return true
    if (Array.isArray(task.subtasks)) pending.push(...task.subtasks)
  }
  return false
}

function cloneFilter(filter: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!filter) return null
  return Object.fromEntries(
    Object.entries(filter).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])
  )
}

function replaceFilter(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key]
  }
  Object.assign(target, source)
}
