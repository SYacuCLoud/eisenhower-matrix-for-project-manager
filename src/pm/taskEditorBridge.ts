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

/**
 * dotpm(구 Project Manager) 편집기 표면 설정. dotpm 2.x의 `taskEditorSurface`
 * 값이며, 설정이 없는 구버전(1.8.x)은 항상 모달이다.
 */
export type PmEditorSurface = 'modal' | 'tab'

/** dotpm 2.x `editorSaveModifier`. 저장 단축키는 `[수정키]+Enter`. 설정이 없으면 Shift. */
export type PmSaveModifier = 'Shift' | 'Mod'

/**
 * 지원 세대 판정. 버전 문자열이 아니라 실제로 존재하는 내부 기능으로 나눈다.
 *  - `dotpm-2`: store.reloadProject / router.openTask / ProjectView.loadScope 계열 (2.3.x 확인)
 *  - `pm-1`:    store.invalidateForPath / ProjectView.loadProject / TableView.handleKeyDown 계열 (1.8.x)
 *  - `unknown`: 위 둘 다 확인되지 않음 — 공개 API와 DOM 클릭 경로만 시도한다.
 */
export type PmGeneration = 'dotpm-2' | 'pm-1' | 'unknown'

export interface PmIntegrationInfo {
  /** `manifest.version`. 표시·로그 용도로만 쓴다. */
  version: string
  generation: PmGeneration
  editorSurface: PmEditorSurface
}

interface PmPluginShape {
  manifest?: { version?: unknown; name?: unknown }
  settings?: { taskEditorSurface?: unknown; editorSaveModifier?: unknown }
  store?: PmStoreShape
  router?: PmRouterShape
  openTaskModalForProject?: (project: unknown, parentId: string | null, defaults?: NewTaskDefaults) => void
}

interface PmStoreShape {
  loadProject?: (file: TFile) => Promise<unknown>
  deleteTask?: (project: unknown, taskId: string) => Promise<unknown>
  /** dotpm 2.x: 디스크에서 다시 읽어 캐시된 프로젝트 객체를 제자리에서 갱신한다. */
  reloadProject?: (path: string) => Promise<unknown>
  /** PM 1.8.x: 캐시 항목을 버린다. 다음 loadProject가 다시 읽는다. */
  invalidateForPath?: (path: string) => void
}

interface PmRouterShape {
  openProjectByPath?: (path: string, ...args: unknown[]) => unknown
  /** dotpm 2.x 탭 편집기. `{ filePath }` 또는 `{ projectPath, parentId, defaults }`. */
  openTask?: (state: Record<string, unknown>) => unknown | Promise<unknown>
}

function asPlugin(plugin: unknown): PmPluginShape | null {
  return plugin && typeof plugin === 'object' ? (plugin as PmPluginShape) : null
}

export function pmEditorSurface(plugin: unknown): PmEditorSurface {
  const surface = asPlugin(plugin)?.settings?.taskEditorSurface
  return surface === 'tab' ? 'tab' : 'modal'
}

export function pmSaveModifier(plugin: unknown): PmSaveModifier {
  const modifier = asPlugin(plugin)?.settings?.editorSaveModifier
  return modifier === 'Mod' ? 'Mod' : 'Shift'
}

export function detectPmIntegration(plugin: unknown): PmIntegrationInfo {
  const bridge = asPlugin(plugin)
  const rawVersion = bridge?.manifest?.version
  const version = typeof rawVersion === 'string' ? rawVersion : ''
  let generation: PmGeneration = 'unknown'
  if (
    typeof bridge?.store?.reloadProject === 'function' ||
    typeof bridge?.router?.openTask === 'function'
  ) {
    generation = 'dotpm-2'
  } else if (typeof bridge?.store?.invalidateForPath === 'function') {
    generation = 'pm-1'
  }
  return { version, generation, editorSurface: pmEditorSurface(plugin) }
}

/**
 * 프로젝트 캐시를 최신 상태로 만든다. dotpm 2.x는 `reloadProject`가 캐시 객체를
 * 제자리에서 갱신하므로 이미 들고 있는 참조도 함께 새로워진다. PM 1.8.x는
 * `invalidateForPath` 뒤에 다시 `loadProject`해야 한다. 둘 다 없으면 false.
 */
async function refreshProjectCache(store: PmStoreShape | undefined, path: string): Promise<boolean> {
  if (typeof store?.reloadProject === 'function') {
    await store.reloadProject(path)
    return true
  }
  if (typeof store?.invalidateForPath === 'function') {
    store.invalidateForPath(path)
    return true
  }
  return false
}

/** dotpm store를 통해 작업 파일과 프로젝트/부모 관계를 함께 정리한다. (1.8.x, 2.3.x 동일 시그니처) */
export async function tryDeleteTask(
  plugin: unknown,
  projectFile: TFile,
  taskId: string
): Promise<boolean> {
  const bridge = asPlugin(plugin)
  if (!bridge || !taskId) return false
  const store = bridge.store
  if (typeof store?.loadProject !== 'function' || typeof store.deleteTask !== 'function') {
    return false
  }
  try {
    let project = await store.loadProject(projectFile)
    if (!projectHasTask(project, taskId) && (await refreshProjectCache(store, projectFile.path))) {
      project = await store.loadProject(projectFile)
    }
    if (!project) return false
    // 캐시가 오래된 경우 deleteTask는 대상을 찾지 못해도 예외 없이 끝난다(1.8.x, 2.3.x 모두).
    // 실제 작업을 확인한 경우에만 삭제를 호출해 거짓 성공을 막는다.
    if (!projectHasTask(project, taskId)) return false
    await store.deleteTask(project, taskId)
    return !projectHasTask(project, taskId)
  } catch (error) {
    console.warn('[EIS] dotpm 작업 삭제에 실패했습니다.', error)
    return false
  }
}

/**
 * 작업 생성. `openTaskModalForProject(project, parentId, defaults)`는 1.8.x와 2.3.x에서
 * 같은 시그니처로 남아 있고, 2.x는 내부에서 편집기 표면 설정을 따른다.
 *  - modal: 저장 콜백이 프로젝트 탭을 강제로 여는 동작을 한 번만 막는다.
 *  - tab:   dotpm이 새 편집기 탭을 열고 저장 콜백을 쓰지 않으므로 가드가 필요 없다.
 * 실패 시 false로 안전하게 폴백한다.
 */
export async function tryOpenNewTaskModal(
  plugin: unknown,
  projectFile: TFile,
  defaults: NewTaskDefaults,
  ownerDocument?: Document
): Promise<boolean> {
  const bridge = asPlugin(plugin)
  if (!bridge) return false
  if (typeof bridge.store?.loadProject !== 'function') return false
  if (typeof bridge.openTaskModalForProject !== 'function') return false
  let navigationGuard: NavigationGuard | null = null
  try {
    const project = await bridge.store.loadProject(projectFile)
    if (!project) return false
    navigationGuard =
      pmEditorSurface(plugin) === 'modal'
        ? suppressModalProjectNavigation(bridge, projectPath(project, projectFile.path), ownerDocument)
        : noopGuard()
    bridge.openTaskModalForProject.call(plugin, project, null, defaults)
    navigationGuard.watchModal()
    return true
  } catch (error) {
    navigationGuard?.restore()
    console.warn('[EIS] dotpm 작업 생성 창을 열지 못했습니다.', error)
    return false
  }
}

interface NavigationGuard {
  watchModal: () => void
  restore: () => void
}

function noopGuard(): NavigationGuard {
  return { watchModal: () => undefined, restore: () => undefined }
}

/** 모달 생성 편집기의 저장 콜백이 프로젝트 탭을 강제로 여는 동작만 한 번 막는다. (1.8.x, 2.3.x 동일) */
function suppressModalProjectNavigation(
  bridge: PmPluginShape,
  targetPath: string,
  ownerDocument?: Document
): NavigationGuard {
  const router = bridge.router
  const original = router?.openProjectByPath
  if (!router || typeof original !== 'function' || !ownerDocument) {
    return noopGuard()
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
 * dotpm이 향후 공개 API를 제공하면 내부 호환 계층보다 먼저 사용한다.
 * capability 함수가 있는 API는 명시적으로 task-editor.open을 지원해야 한다.
 * (2.3.1의 `plugin.api`는 존재하지 않는다. dotpm이 다른 플러그인의 api를 소비할 때
 * 쓰는 `apiVersion`/`hasCapability` 규약과 같은 형태를 기대한다.)
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
    console.warn('[EIS] dotpm 작업 편집 API 호출에 실패했습니다.', error)
    return false
  }
}

/**
 * dotpm 2.x 탭 편집기. 사용자가 `taskEditorSurface: 'tab'`을 골랐다면 dotpm 자신도
 * `router.openTask({ filePath })`로 새 탭을 열어 전환하므로, 매트릭스도 같은 경로를
 * 그대로 따른다(숨은 프로젝트 leaf가 필요 없다). 모달 설정이면 false.
 */
export async function tryOpenTaskEditorInTab(plugin: unknown, taskPath: string): Promise<boolean> {
  const bridge = asPlugin(plugin)
  if (!bridge || !taskPath) return false
  if (pmEditorSurface(plugin) !== 'tab') return false
  const router = bridge.router
  if (typeof router?.openTask !== 'function') return false
  try {
    await router.openTask.call(router, { filePath: taskPath })
    return true
  } catch (error) {
    console.warn('[EIS] dotpm 탭 편집기를 열지 못했습니다.', error)
    return false
  }
}

interface PmTaskLike {
  id?: unknown
  subtasks?: unknown
}

/** PM 1.8.x TableView. 2.x에는 handleKeyDown이 없고 키 처리가 Obsidian Scope로 옮겨갔다. */
interface PmLegacyTableSubview {
  state?: { selectedTaskId?: string | null }
  handleKeyDown?: (event: KeyboardEvent) => void
}

/** dotpm 2.x Board(kanban) subview. 카드 클릭이 호출하는 메서드로 편집기 표면 설정을 따른다. */
interface PmKanbanSubview {
  openTask?: (task: unknown) => void
}

/** dotpm 2.x ProjectView의 scope. 다중 프로젝트(폴더·볼트 범위)도 taskIndex로 찾는다. */
interface PmProjectScope {
  primary?: unknown
  projects?: unknown
  projectOf?: (taskId: string) => unknown
  taskById?: (taskId: string) => unknown
}

interface PmProjectViewCompat {
  currentView?: unknown
  filter?: Record<string, unknown>
  /** 1.8.x는 필드, 2.x는 `projectScope.primary`를 돌려주는 getter(읽기 전용). */
  project?: { tasks?: unknown; taskIndex?: unknown } | null
  projectScope?: PmProjectScope | null
  subview?: (PmLegacyTableSubview & PmKanbanSubview) | null
  renderCurrentView?: () => void
  /** PM 1.8.x */
  loadProject?: () => Promise<void>
  /** dotpm 2.x */
  loadScope?: () => Promise<void>
}

function viewHasTask(view: PmProjectViewCompat, taskId: string): boolean {
  const scope = view.projectScope
  if (scope && typeof scope.projectOf === 'function') {
    try {
      if (scope.projectOf(taskId)) return true
    } catch {
      // scope 구조가 바뀐 경우 아래 project 기반 확인으로 넘어간다.
    }
  }
  return projectHasTask(view.project, taskId)
}

/** 오래된 백그라운드 dotpm 뷰가 새 작업을 모를 때에만 캐시와 뷰를 다시 불러온다. */
export async function ensureProjectViewTask(
  plugin: unknown,
  rawView: unknown,
  projectPath: string,
  taskId: string
): Promise<boolean> {
  if (!rawView || typeof rawView !== 'object' || !taskId) return false
  const view = rawView as PmProjectViewCompat
  if (viewHasTask(view, taskId)) return true
  const reload =
    typeof view.loadScope === 'function'
      ? view.loadScope
      : typeof view.loadProject === 'function'
        ? view.loadProject
        : null
  if (!reload) return false

  try {
    await refreshProjectCache(asPlugin(plugin)?.store, projectPath)
    await reload.call(view)
    return viewHasTask(view, taskId)
  } catch (error) {
    console.warn('[EIS] dotpm 프로젝트 뷰 갱신에 실패했습니다.', error)
    return false
  }
}

/**
 * 프로젝트 뷰 내부 경로로 편집기를 연다. 접힘·필터·가상 스크롤 밖의 작업도 열 수 있다.
 *  - dotpm 2.x: `projectScope`에서 작업 객체를 찾아 Board subview의 `openTask`에 넘긴다.
 *    (Board는 표시 여부와 무관하게 작업 객체만 필요하다. 필요하면 잠시 Board로 전환한다.)
 *  - PM 1.8.x: 필터를 메모리에서만 잠시 해제한 TableView에 Enter 키 동작을 보낸다.
 * 두 경로 모두 원래 뷰 모드를 복원하며, 실패 시 false.
 */
export function tryOpenTaskEditorFromProjectView(
  rawView: unknown,
  taskId: string,
  makeKeyboardEvent: () => KeyboardEvent = () => new KeyboardEvent('keydown', { key: 'Enter' })
): boolean {
  if (!rawView || typeof rawView !== 'object') return false
  const view = rawView as PmProjectViewCompat
  if (typeof view.renderCurrentView !== 'function') return false
  if (view.projectScope && typeof view.projectScope === 'object') {
    return openViaBoardSubview(view, taskId)
  }
  return openViaLegacyTableSubview(view, taskId, makeKeyboardEvent)
}

function openViaBoardSubview(view: PmProjectViewCompat, taskId: string): boolean {
  const task = findScopeTask(view.projectScope, taskId)
  if (!task) return false
  if (typeof view.subview?.openTask === 'function') {
    try {
      view.subview.openTask(task)
      return true
    } catch (error) {
      console.warn('[EIS] dotpm Board 편집 경로에 실패했습니다.', error)
      return false
    }
  }

  const originalMode = view.currentView
  try {
    view.currentView = 'kanban'
    view.renderCurrentView!()
    const subview = view.subview
    if (typeof subview?.openTask !== 'function') return false
    subview.openTask(task)
    return true
  } catch (error) {
    console.warn('[EIS] dotpm Board 편집 경로에 실패했습니다.', error)
    return false
  } finally {
    view.currentView = originalMode
    try {
      view.renderCurrentView!()
    } catch {
      // dotpm 내부 구조가 바뀐 경우 원래 화면 복원 실패가 편집기 폴백을 막지 않게 한다.
    }
  }
}

function findScopeTask(scope: PmProjectScope | null | undefined, taskId: string): unknown {
  if (!scope) return null
  try {
    if (typeof scope.taskById === 'function') {
      const task = scope.taskById(taskId)
      if (task) return task
    }
    const project = typeof scope.projectOf === 'function' ? scope.projectOf(taskId) : scope.primary
    return findTaskInProject(project, taskId)
  } catch {
    return null
  }
}

function openViaLegacyTableSubview(
  view: PmProjectViewCompat,
  taskId: string,
  makeKeyboardEvent: () => KeyboardEvent
): boolean {
  if (!projectHasTask(view.project, taskId)) return false

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
    view.renderCurrentView!()
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
      view.renderCurrentView!()
    } catch {
      // PM 내부 구조가 바뀐 경우 원래 화면 복원 실패가 편집기 폴백을 막지 않게 한다.
    }
  }
}

function findTaskInProject(project: unknown, taskId: string): unknown {
  if (!project || typeof project !== 'object') return null
  const candidate = project as NonNullable<PmProjectViewCompat['project']>
  if (candidate.taskIndex instanceof Map) {
    const entry = candidate.taskIndex.get(taskId) as { task?: unknown } | undefined
    if (entry?.task) return entry.task
  }
  if (!Array.isArray(candidate.tasks)) return null
  const pending = [...candidate.tasks]
  const seen = new Set<unknown>()
  while (pending.length > 0) {
    const value = pending.pop()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    const task = value as PmTaskLike
    if (task.id === taskId) return task
    if (Array.isArray(task.subtasks)) pending.push(...task.subtasks)
  }
  return null
}

function projectHasTask(project: unknown, taskId: string): boolean {
  return findTaskInProject(project, taskId) !== null
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
