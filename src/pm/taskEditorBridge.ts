import type { TFile } from 'obsidian'

export interface PmTaskEditorRequest {
  projectPath: string
  taskId: string
  taskPath: string
}

export interface NewTaskDefaults {
  due: string
  priority: string
}

interface PmCreateBridge {
  store?: {
    loadProject?: (file: TFile) => Promise<unknown>
  }
  router?: {
    openProjectByPath?: (path: string, ...args: unknown[]) => unknown
  }
  openTaskModalForProject?: (
    project: unknown,
    parentId: string | null,
    defaults?: NewTaskDefaults
  ) => void
}

interface PmDeleteBridge {
  store?: {
    loadProject?: (file: TFile) => Promise<unknown>
    deleteTask?: (project: unknown, taskId: string) => Promise<unknown>
  }
}

/** PM 1.8.x store를 통해 작업 파일과 프로젝트/부모 관계를 함께 정리한다. */
export async function tryDeleteTask(
  plugin: unknown,
  projectFile: TFile,
  taskId: string
): Promise<boolean> {
  if (!plugin || typeof plugin !== 'object' || !taskId) return false
  const bridge = plugin as PmDeleteBridge
  if (
    typeof bridge.store?.loadProject !== 'function' ||
    typeof bridge.store.deleteTask !== 'function'
  ) {
    return false
  }
  try {
    const project = await bridge.store.loadProject(projectFile)
    if (!project) return false
    await bridge.store.deleteTask(project, taskId)
    return true
  } catch (error) {
    console.warn('[EIS] Project Manager 작업 삭제에 실패했습니다.', error)
    return false
  }
}

/** PM 1.8.x 내부 capability. 존재 여부를 확인하고 실패 시 false로 안전하게 폴백한다. */
export async function tryOpenNewTaskModal(
  plugin: unknown,
  projectFile: TFile,
  defaults: NewTaskDefaults,
  ownerDocument?: Document
): Promise<boolean> {
  if (!plugin || typeof plugin !== 'object') return false
  const bridge = plugin as PmCreateBridge
  if (typeof bridge.store?.loadProject !== 'function') return false
  if (typeof bridge.openTaskModalForProject !== 'function') return false
  let navigationGuard: NavigationGuard | null = null
  try {
    const project = await bridge.store.loadProject(projectFile)
    if (!project) return false
    navigationGuard = suppressModalProjectNavigation(
      bridge,
      projectPath(project, projectFile.path),
      ownerDocument
    )
    bridge.openTaskModalForProject.call(plugin, project, null, defaults)
    navigationGuard.watchModal()
    return true
  } catch (error) {
    navigationGuard?.restore()
    console.warn('[EIS] Project Manager 작업 생성 모달을 열지 못했습니다.', error)
    return false
  }
}

interface NavigationGuard {
  watchModal: () => void
  restore: () => void
}

/** PM 1.8 생성 모달의 저장 콜백이 프로젝트 탭을 강제로 여는 동작만 한 번 막는다. */
function suppressModalProjectNavigation(
  bridge: PmCreateBridge,
  targetPath: string,
  ownerDocument?: Document
): NavigationGuard {
  const router = bridge.router
  const original = router?.openProjectByPath
  if (!router || typeof original !== 'function' || !ownerDocument) {
    return { watchModal: () => undefined, restore: () => undefined }
  }

  const existingModals = new Set(Array.from(ownerDocument.querySelectorAll('.pm-modal--task')))
  let modalEl: Element | null = null
  let observer: MutationObserver | null = null
  let timer: number | null = null
  let restored = false

  const restore = (): void => {
    if (restored) return
    restored = true
    if (router.openProjectByPath === guardedOpenProject) router.openProjectByPath = original
    observer?.disconnect()
    if (timer !== null) ownerDocument.defaultView?.clearTimeout(timer)
  }
  const guardedOpenProject = (path: string, ...args: unknown[]): unknown => {
    if (path === targetPath) {
      restore()
      return Promise.resolve()
    }
    return original.call(router, path, ...args)
  }
  router.openProjectByPath = guardedOpenProject

  const findModal = (): Element | null =>
    Array.from(ownerDocument.querySelectorAll('.pm-modal--task')).find(
      (element) => !existingModals.has(element)
    ) ?? null

  return {
    watchModal: () => {
      modalEl = findModal()
      const MutationObserverCtor = ownerDocument.defaultView?.MutationObserver
      if (MutationObserverCtor && ownerDocument.body) {
        observer = new MutationObserverCtor(() => {
          modalEl ??= findModal()
          if (modalEl && !modalEl.isConnected) restore()
        })
        observer.observe(ownerDocument.body, { childList: true, subtree: true })
      }
      timer = ownerDocument.defaultView?.setTimeout(() => {
        modalEl ??= findModal()
        if (!modalEl) restore()
      }, 0) ?? null
    },
    restore
  }
}

function projectPath(project: unknown, fallback: string): string {
  if (!project || typeof project !== 'object') return fallback
  const path = (project as { filePath?: unknown }).filePath
  return typeof path === 'string' ? path : fallback
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
