import { describe, expect, it, vi } from 'vitest'
import {
  tryOpenNewTaskModal,
  tryOpenTaskEditorApi,
  tryOpenTaskEditorFromProjectView,
  type PmTaskEditorRequest
} from '../src/pm/taskEditorBridge'
import type { TFile } from 'obsidian'

const request: PmTaskEditorRequest = {
  projectPath: 'Projects/demo.md',
  taskId: 'task-1',
  taskPath: 'Projects/demo_tasks/task.md'
}

describe('Project Manager 공개 API 연동', () => {
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

describe('Project Manager 작업 생성 호환 경로', () => {
  it('프로젝트를 로드하고 기본값과 함께 생성 모달을 연다', async () => {
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

  it('생성 작업 저장 뒤 Project Manager 프로젝트 화면으로 이동하지 않는다', async () => {
    const project = { id: 'project-1', filePath: 'Projects/demo.md' }
    const file = { path: project.filePath } as TFile
    const originalOpenProject = vi.fn()
    const modals: Array<{ isConnected: boolean }> = []
    const ownerDocument = makeModalDocument(modals)
    const plugin = {
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

  it('생성 모달을 취소하면 Project Manager 라우터를 원상 복구한다', async () => {
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

describe('Project Manager 1.8 TableView 호환 경로', () => {
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
