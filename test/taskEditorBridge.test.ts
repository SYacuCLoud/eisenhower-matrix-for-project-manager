import { describe, expect, it, vi } from 'vitest'
import {
  detectPmIntegration,
  ensureProjectViewTask,
  pmEditorSurface,
  tryOpenNewTaskModal,
  tryDeleteTask,
  tryOpenTaskEditorApi,
  tryOpenTaskEditorFromProjectView,
  tryOpenTaskEditorInTab,
  type PmTaskEditorRequest
} from '../src/pm/taskEditorBridge'
import type { TFile } from 'obsidian'

const request: PmTaskEditorRequest = {
  projectPath: 'Projects/demo.md',
  taskId: 'task-1',
  taskPath: 'Projects/demo_tasks/task.md'
}

describe('dotpm 세대·편집기 표면 판정', () => {
  it('reloadProject 또는 router.openTask가 있으면 dotpm 2.x로 본다', () => {
    expect(
      detectPmIntegration({
        manifest: { version: '2.3.1' },
        settings: { taskEditorSurface: 'tab' },
        store: { reloadProject: vi.fn() }
      })
    ).toEqual({ version: '2.3.1', generation: 'dotpm-2', editorSurface: 'tab' })
    expect(detectPmIntegration({ router: { openTask: vi.fn() } }).generation).toBe('dotpm-2')
  })

  it('invalidateForPath만 있으면 PM 1.8.x, 둘 다 없으면 unknown', () => {
    expect(
      detectPmIntegration({ manifest: { version: '1.8.0' }, store: { invalidateForPath: vi.fn() } })
    ).toEqual({ version: '1.8.0', generation: 'pm-1', editorSurface: 'modal' })
    expect(detectPmIntegration({})).toEqual({ version: '', generation: 'unknown', editorSurface: 'modal' })
    expect(detectPmIntegration(null)).toEqual({ version: '', generation: 'unknown', editorSurface: 'modal' })
  })

  it('편집기 표면은 tab 외의 값은 모두 modal로 본다', () => {
    expect(pmEditorSurface({ settings: { taskEditorSurface: 'tab' } })).toBe('tab')
    expect(pmEditorSurface({ settings: { taskEditorSurface: 'modal' } })).toBe('modal')
    expect(pmEditorSurface({ settings: {} })).toBe('modal')
    expect(pmEditorSurface(undefined)).toBe('modal')
  })
})

describe('dotpm 작업 삭제 호환 경로', () => {
  it('프로젝트를 로드한 뒤 store 삭제를 호출한다', async () => {
    const project = {
      id: 'project-1',
      tasks: [{ id: 'task-1', subtasks: [] }],
      taskIndex: new Map([['task-1', { task: { id: 'task-1' }, parentId: null }]])
    }
    const file = { path: 'Projects/demo.md' } as TFile
    const store = {
      loadProject: vi.fn().mockResolvedValue(project),
      deleteTask: vi.fn(async () => {
        project.tasks = []
        project.taskIndex.delete('task-1')
      })
    }

    expect(await tryDeleteTask({ store }, file, 'task-1')).toBe(true)
    expect(store.loadProject).toHaveBeenCalledWith(file)
    expect(store.deleteTask).toHaveBeenCalledWith(project, 'task-1')
  })

  it('PM 1.8.x: 오래된 캐시는 invalidateForPath 후 다시 로드한 뒤 삭제한다', async () => {
    const stale = { tasks: [], taskIndex: new Map() }
    const fresh = {
      tasks: [{ id: 'task-1', subtasks: [] }],
      taskIndex: new Map([['task-1', { task: { id: 'task-1' }, parentId: null }]])
    }
    const file = { path: 'Projects/demo.md' } as TFile
    const store = {
      loadProject: vi.fn().mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh),
      invalidateForPath: vi.fn(),
      deleteTask: vi.fn(async () => {
        fresh.tasks = []
        fresh.taskIndex.delete('task-1')
      })
    }

    expect(await tryDeleteTask({ store }, file, 'task-1')).toBe(true)
    expect(store.invalidateForPath).toHaveBeenCalledWith(file.path)
    expect(store.loadProject).toHaveBeenCalledTimes(2)
  })

  it('dotpm 2.x: 오래된 캐시는 reloadProject로 제자리 갱신한 뒤 삭제한다', async () => {
    // reloadProject는 캐시된 프로젝트 객체를 adopt()로 덮어쓰므로 같은 참조가 새로워진다.
    const project: { tasks: unknown[]; taskIndex: Map<string, unknown> } = { tasks: [], taskIndex: new Map() }
    const file = { path: 'Projects/demo.md' } as TFile
    const store = {
      loadProject: vi.fn().mockResolvedValue(project),
      reloadProject: vi.fn(async (path: string) => {
        expect(path).toBe(file.path)
        project.tasks = [{ id: 'task-1', subtasks: [] }]
        project.taskIndex.set('task-1', { task: { id: 'task-1' }, parentId: null })
      }),
      invalidateForPath: undefined,
      deleteTask: vi.fn(async () => {
        project.tasks = []
        project.taskIndex.delete('task-1')
      })
    }

    expect(await tryDeleteTask({ store }, file, 'task-1')).toBe(true)
    expect(store.reloadProject).toHaveBeenCalledTimes(1)
    expect(store.deleteTask).toHaveBeenCalledWith(project, 'task-1')
  })

  it('갱신 뒤에도 작업이 없으면 deleteTask를 호출하지 않는다(거짓 성공 방지)', async () => {
    const project = { tasks: [], taskIndex: new Map() }
    const store = {
      loadProject: vi.fn().mockResolvedValue(project),
      reloadProject: vi.fn(async () => undefined),
      deleteTask: vi.fn()
    }
    expect(await tryDeleteTask({ store }, { path: 'Projects/demo.md' } as TFile, 'task-1')).toBe(false)
    expect(store.deleteTask).not.toHaveBeenCalled()
  })

  it('삭제 기능이 없거나 작업 id가 비어 있으면 아무것도 삭제하지 않는다', async () => {
    expect(await tryDeleteTask({}, {} as TFile, 'task-1')).toBe(false)
    expect(await tryDeleteTask({ store: {} }, {} as TFile, '')).toBe(false)
  })

  it('삭제 중 오류가 발생하면 실패로 반환한다', async () => {
    const project = {
      tasks: [{ id: 'task-1', subtasks: [] }],
      taskIndex: new Map([['task-1', { task: { id: 'task-1' }, parentId: null }]])
    }
    const store = {
      loadProject: vi.fn().mockResolvedValue(project),
      deleteTask: vi.fn().mockRejectedValue(new Error('failed'))
    }

    expect(await tryDeleteTask({ store }, {} as TFile, 'task-1')).toBe(false)
  })
})

describe('dotpm 공개 API 연동', () => {
  it('capability가 있는 openTaskEditor API를 우선 호출한다', async () => {
    const openTaskEditor = vi.fn()
    const plugin = {
      api: {
        hasCapability: (capability: string) => capability === 'task-editor.open',
        openTaskEditor
      }
    }
    expect(await tryOpenTaskEditorApi(plugin, request)).toBe(true)
    expect(openTaskEditor).toHaveBeenCalledWith(request)
  })

  it('capability가 없으면 알 수 없는 API를 호출하지 않는다', async () => {
    const openTaskEditor = vi.fn()
    const plugin = { api: { hasCapability: () => false, openTaskEditor } }
    expect(await tryOpenTaskEditorApi(plugin, request)).toBe(false)
    expect(openTaskEditor).not.toHaveBeenCalled()
  })

  it('capability 계약이 없는 동명 메서드는 호출하지 않는다', async () => {
    const openTaskEditor = vi.fn()
    expect(await tryOpenTaskEditorApi({ api: { openTaskEditor } }, request)).toBe(false)
    expect(openTaskEditor).not.toHaveBeenCalled()
  })
})

describe('dotpm 2.x 탭 편집기 경로', () => {
  it('편집기 설정이 tab이면 router.openTask({ filePath })를 호출한다', async () => {
    const router = { openTask: vi.fn(function (this: unknown) { expect(this).toBe(router) }) }
    const plugin = { settings: { taskEditorSurface: 'tab' }, router }
    expect(await tryOpenTaskEditorInTab(plugin, request.taskPath)).toBe(true)
    expect(router.openTask).toHaveBeenCalledWith({ filePath: request.taskPath })
  })

  it('편집기 설정이 modal이면 탭 경로를 쓰지 않는다', async () => {
    const router = { openTask: vi.fn() }
    expect(await tryOpenTaskEditorInTab({ settings: { taskEditorSurface: 'modal' }, router }, request.taskPath)).toBe(false)
    expect(await tryOpenTaskEditorInTab({ settings: {}, router }, request.taskPath)).toBe(false)
    expect(router.openTask).not.toHaveBeenCalled()
  })

  it('router.openTask가 없거나(1.8.x) 실패하면 false', async () => {
    expect(await tryOpenTaskEditorInTab({ settings: { taskEditorSurface: 'tab' }, router: {} }, request.taskPath)).toBe(false)
    const router = { openTask: vi.fn().mockRejectedValue(new Error('boom')) }
    expect(await tryOpenTaskEditorInTab({ settings: { taskEditorSurface: 'tab' }, router }, request.taskPath)).toBe(false)
    expect(await tryOpenTaskEditorInTab({ settings: { taskEditorSurface: 'tab' }, router }, '')).toBe(false)
  })
})

describe('dotpm 작업 생성 호환 경로', () => {
  it('프로젝트를 로드하고 기본값과 함께 생성 창을 연다', async () => {
    const project = { id: 'project-1' }
    const file = { path: 'Projects/demo.md' } as TFile
    const openTaskModalForProject = vi.fn(function (this: unknown) {
      expect(this).toBe(plugin)
    })
    const plugin = {
      store: { loadProject: vi.fn().mockResolvedValue(project) },
      openTaskModalForProject
    }
    const defaults = { due: '2026-08-08', priority: 'high' }

    expect(await tryOpenNewTaskModal(plugin, file, defaults)).toBe(true)
    expect(plugin.store.loadProject).toHaveBeenCalledWith(file)
    expect(openTaskModalForProject).toHaveBeenCalledWith(project, null, defaults)
  })

  it('필요한 capability가 없으면 호출하지 않는다', async () => {
    expect(await tryOpenNewTaskModal({}, {} as TFile, { due: '', priority: 'low' })).toBe(false)
  })

  it('모달 설정: 생성 작업 저장 뒤 dotpm 프로젝트 화면으로 이동하지 않는다', async () => {
    const project = { id: 'project-1', filePath: 'Projects/demo.md' }
    const file = { path: project.filePath } as TFile
    const originalOpenProject = vi.fn()
    const modals: Array<{ isConnected: boolean }> = []
    const ownerDocument = makeModalDocument(modals)
    const plugin = {
      settings: { taskEditorSurface: 'modal' },
      store: { loadProject: vi.fn().mockResolvedValue(project) },
      router: { openProjectByPath: originalOpenProject },
      openTaskModalForProject: vi.fn(() => modals.push({ isConnected: true }))
    }

    expect(
      await tryOpenNewTaskModal(plugin, file, { due: '2026-08-08', priority: 'high' }, ownerDocument)
    ).toBe(true)
    expect(plugin.router.openProjectByPath).not.toBe(originalOpenProject)

    await plugin.router.openProjectByPath(project.filePath)
    expect(originalOpenProject).not.toHaveBeenCalled()
    expect(plugin.router.openProjectByPath).toBe(originalOpenProject)
  })

  it('탭 설정: dotpm이 편집기 탭을 열므로 라우터를 감싸지 않는다', async () => {
    const project = { id: 'project-1', filePath: 'Projects/demo.md' }
    const file = { path: project.filePath } as TFile
    const originalOpenProject = vi.fn()
    const openTask = vi.fn()
    const ownerDocument = makeModalDocument([])
    const defaults = { due: '2026-08-08', priority: 'high' }
    const plugin = {
      settings: { taskEditorSurface: 'tab' },
      store: { loadProject: vi.fn().mockResolvedValue(project) },
      router: { openProjectByPath: originalOpenProject, openTask },
      // dotpm 2.x 내부(im)는 tab 설정이면 router.openTask로 새 편집기 탭을 연다.
      openTaskModalForProject: vi.fn(function (this: { router: { openTask: typeof openTask } }, p: unknown, parentId: null, d: unknown) {
        this.router.openTask({ projectPath: (p as { filePath: string }).filePath, parentId, defaults: d })
      })
    }

    expect(await tryOpenNewTaskModal(plugin, file, defaults, ownerDocument)).toBe(true)
    expect(plugin.router.openProjectByPath).toBe(originalOpenProject)
    expect(openTask).toHaveBeenCalledWith({ projectPath: project.filePath, parentId: null, defaults })
  })

  it('생성 모달을 취소하면 dotpm 라우터를 원상 복구한다', async () => {
    const project = { id: 'project-1', filePath: 'Projects/demo.md' }
    const file = { path: project.filePath } as TFile
    const originalOpenProject = vi.fn()
    const modals: Array<{ isConnected: boolean }> = []
    const modalDocument = makeModalDocument(modals)
    const plugin = {
      store: { loadProject: vi.fn().mockResolvedValue(project) },
      router: { openProjectByPath: originalOpenProject },
      openTaskModalForProject: vi.fn(() => modals.push({ isConnected: true }))
    }

    await tryOpenNewTaskModal(
      plugin,
      file,
      { due: '2026-08-08', priority: 'high' },
      modalDocument.document
    )
    modals[0]!.isConnected = false
    modalDocument.notifyMutation()

    expect(plugin.router.openProjectByPath).toBe(originalOpenProject)
  })
})

function makeModalDocument(modals: Array<{ isConnected: boolean }>): Document & {
  document: Document
  notifyMutation: () => void
} {
  let mutationCallback = (): void => undefined
  class FakeMutationObserver {
    constructor(callback: () => void) {
      mutationCallback = callback
    }
    observe(): void {}
    disconnect(): void {}
  }
  const document = {
    body: {},
    querySelectorAll: () => modals.filter((modal) => modal.isConnected),
    defaultView: {
      MutationObserver: FakeMutationObserver,
      setTimeout: () => 1,
      clearTimeout: () => undefined
    }
  } as unknown as Document
  return Object.assign(document, {
    document,
    notifyMutation: () => mutationCallback()
  })
}

describe('dotpm 2.x ProjectView 호환 경로', () => {
  function makeScope(projects: Array<{ taskIndex: Map<string, { task: unknown; parentId: string | null }> }>) {
    return {
      projects,
      get primary() {
        return projects[0] ?? null
      },
      projectOf(taskId: string) {
        return projects.find((project) => project.taskIndex.has(taskId)) ?? null
      },
      taskById(taskId: string) {
        return this.projectOf(taskId)?.taskIndex.get(taskId)?.task ?? null
      }
    }
  }

  it('백그라운드 뷰가 새 작업을 모르면 reloadProject 뒤 loadScope로 다시 읽는다', async () => {
    const reloadProject = vi.fn(async () => undefined)
    const task = { id: 'task-1', subtasks: [] }
    const view: Record<string, any> = {
      projectScope: makeScope([{ taskIndex: new Map() }]),
      get project() {
        return this.projectScope.primary
      },
      async loadScope() {
        this.projectScope = makeScope([{ taskIndex: new Map([['task-1', { task, parentId: null }]]) }])
      }
    }

    expect(
      await ensureProjectViewTask({ store: { reloadProject } }, view, 'Projects/demo.md', 'task-1')
    ).toBe(true)
    expect(reloadProject).toHaveBeenCalledWith('Projects/demo.md')
  })

  it('scope가 이미 작업을 알면 다시 읽지 않는다', async () => {
    const loadScope = vi.fn()
    const view = {
      projectScope: makeScope([{ taskIndex: new Map([['task-1', { task: { id: 'task-1' }, parentId: null }]]) }]),
      loadScope
    }
    expect(await ensureProjectViewTask({ store: {} }, view, 'Projects/demo.md', 'task-1')).toBe(true)
    expect(loadScope).not.toHaveBeenCalled()
  })

  it('현재 subview가 Board면 바로 openTask를 호출하고 뷰를 바꾸지 않는다', () => {
    const task = { id: 'task-1', subtasks: [] }
    const openTask = vi.fn()
    const renderCurrentView = vi.fn()
    const view = {
      currentView: 'kanban',
      projectScope: makeScope([{ taskIndex: new Map([['task-1', { task, parentId: null }]]) }]),
      subview: { openTask },
      renderCurrentView
    }
    expect(tryOpenTaskEditorFromProjectView(view, 'task-1')).toBe(true)
    expect(openTask).toHaveBeenCalledWith(task)
    expect(renderCurrentView).not.toHaveBeenCalled()
  })

  it('Table/Gantt 뷰면 Board로 잠시 전환해 openTask를 호출하고 원래 뷰로 복원한다', () => {
    const task = { id: 'task-1', subtasks: [] }
    const opened: unknown[] = []
    const filter = { text: 'needle', statuses: ['todo'] }
    const view: Record<string, any> = {
      currentView: 'table',
      filter,
      projectScope: makeScope([{ taskIndex: new Map([['task-1', { task, parentId: null }]]) }]),
      subview: { state: { selectedTaskId: null } },
      renderCurrentView() {
        this.subview = this.currentView === 'kanban' ? { openTask: (t: unknown) => opened.push(t) } : { state: {} }
      }
    }

    expect(tryOpenTaskEditorFromProjectView(view, 'task-1')).toBe(true)
    expect(opened).toEqual([task])
    expect(view.currentView).toBe('table')
    // 2.x 경로는 표시 여부와 무관하므로 필터를 건드리지 않는다.
    expect(view.filter).toBe(filter)
    expect(view.filter).toEqual({ text: 'needle', statuses: ['todo'] })
  })

  it('다중 프로젝트 scope에서도 작업이 속한 프로젝트를 찾는다', () => {
    const task = { id: 'task-2', subtasks: [] }
    const openTask = vi.fn()
    const view = {
      currentView: 'kanban',
      projectScope: makeScope([
        { taskIndex: new Map([['task-1', { task: { id: 'task-1' }, parentId: null }]]) },
        { taskIndex: new Map([['task-2', { task, parentId: null }]]) }
      ]),
      subview: { openTask },
      renderCurrentView: vi.fn()
    }
    expect(tryOpenTaskEditorFromProjectView(view, 'task-2')).toBe(true)
    expect(openTask).toHaveBeenCalledWith(task)
  })

  it('scope에 없는 작업이면 내부 뷰를 건드리지 않는다', () => {
    const renderCurrentView = vi.fn()
    const view = { currentView: 'table', projectScope: makeScope([{ taskIndex: new Map() }]), renderCurrentView }
    expect(tryOpenTaskEditorFromProjectView(view, 'missing')).toBe(false)
    expect(renderCurrentView).not.toHaveBeenCalled()
  })

  it('Board subview에 openTask가 없으면 실패로 보고 원래 뷰를 복원한다', () => {
    const view: Record<string, any> = {
      currentView: 'gantt',
      projectScope: makeScope([{ taskIndex: new Map([['task-1', { task: { id: 'task-1' }, parentId: null }]]) }]),
      subview: {},
      renderCurrentView() {
        this.subview = {}
      }
    }
    expect(tryOpenTaskEditorFromProjectView(view, 'task-1')).toBe(false)
    expect(view.currentView).toBe('gantt')
  })
})

describe('Project Manager 1.8 TableView 호환 경로', () => {
  it('백그라운드 뷰가 새 작업을 모르면 캐시와 프로젝트를 다시 로드한다', async () => {
    const invalidateForPath = vi.fn()
    const view: Record<string, any> = {
      project: { tasks: [], taskIndex: new Map() },
      async loadProject() {
        this.project = {
          tasks: [{ id: 'task-1', subtasks: [] }],
          taskIndex: new Map([['task-1', { task: { id: 'task-1' }, parentId: null }]])
        }
      }
    }

    expect(
      await ensureProjectViewTask(
        { store: { invalidateForPath } },
        view,
        'Projects/demo.md',
        'task-1'
      )
    ).toBe(true)
    expect(invalidateForPath).toHaveBeenCalledWith('Projects/demo.md')
  })

  it('필터와 뷰를 잠시 전환해 선택 작업에 Enter를 보내고 원상 복구한다', () => {
    const originalFilter = {
      text: 'needle',
      statuses: ['todo'],
      priorities: ['high'],
      assignees: ['alice'],
      tags: ['tag'],
      dueDateFilter: 'overdue',
      showArchived: false
    }
    const pressed: Array<{ id: string | null | undefined; key: string }> = []
    const view: Record<string, any> = {
      currentView: 'kanban',
      filter: { ...originalFilter },
      project: { tasks: [{ id: 'task-1', subtasks: [] }] },
      subview: null,
      renderCurrentView() {
        if (this.currentView === 'table') {
          const state = { selectedTaskId: null as string | null }
          this.subview = {
            state,
            handleKeyDown: (event: KeyboardEvent) =>
              pressed.push({ id: state.selectedTaskId, key: event.key })
          }
        }
      }
    }

    const opened = tryOpenTaskEditorFromProjectView(
      view,
      'task-1',
      () => ({ key: 'Enter' }) as KeyboardEvent
    )
    expect(opened).toBe(true)
    expect(pressed).toEqual([{ id: 'task-1', key: 'Enter' }])
    expect(view.currentView).toBe('kanban')
    expect(view.filter).toEqual(originalFilter)
  })

  it('프로젝트에 없는 작업이면 내부 뷰를 건드리지 않는다', () => {
    const renderCurrentView = vi.fn()
    const view = { project: { tasks: [] }, renderCurrentView }
    expect(tryOpenTaskEditorFromProjectView(view, 'missing')).toBe(false)
    expect(renderCurrentView).not.toHaveBeenCalled()
  })
})
