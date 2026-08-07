import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian'
import { KO } from '../i18n/ko'
import { canMoveToQuadrant, classify, importantIdsForThreshold } from '../model/classify'
import { todayString } from '../model/dates'
import {
  applyMatrixFilter,
  isDefaultFilter,
  makeDefaultFilter,
  prepareTasksForSubtaskMode,
  type FilterContext
} from '../model/filter'
import { sortCards } from '../model/sort'
import { QUADRANT_ORDER, type ClassifyContext, type MatrixTask, type QuadrantId } from '../model/types'
import { readPmPalettes } from '../pm/bridge'
import {
  tryOpenTaskEditorApi,
  tryOpenTaskEditorFromProjectView
} from '../pm/taskEditorBridge'
import { safeAsync } from '../utils'
import { renderQuadrant } from './Quadrant'
import { renderToolbar } from './Toolbar'
import type EisenhowerPlugin from '../main'

export const EISEN_MATRIX_VIEW_TYPE = 'eisenhower-matrix-for-project-manager'

export class MatrixView extends ItemView {
  /** 늦게 도착한 비동기 갱신이 최신 렌더를 덮어쓰지 못하게 하는 가드. */
  private renderToken = 0

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: EisenhowerPlugin
  ) {
    super(leaf)
    this.navigation = false
  }

  getViewType(): string {
    return EISEN_MATRIX_VIEW_TYPE
  }

  getDisplayText(): string {
    return KO.viewTitle
  }

  override getIcon(): string {
    return 'layout-grid'
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('eis-view')
    this.render()
  }

  override async onClose(): Promise<void> {
    this.contentEl.empty()
  }

  render(): void {
    const token = ++this.renderToken
    const scroll = this.captureScroll()
    const focused = this.contentEl.ownerDocument.activeElement
    const restoreSearch = focused instanceof HTMLInputElement && focused.hasClass('eis-search')
    const selectionStart = restoreSearch ? focused.selectionStart : null
    const selectionEnd = restoreSearch ? focused.selectionEnd : null

    this.contentEl.empty()
    if (token !== this.renderToken) return

    const root = this.contentEl.createDiv({ cls: 'eis-root' })
    const settings = this.plugin.settings
    const palettes = readPmPalettes(this.app)

    const ctx: ClassifyContext = {
      today: todayString(),
      urgencyWindowDays: settings.urgencyWindowDays,
      statuses: palettes.statuses,
      priorities: palettes.priorities,
      importantIds: importantIdsForThreshold(palettes.priorities, settings.importantThresholdId)
    }

    const projects = this.plugin.index.allProjects()
    const filterCtx: FilterContext = {
      classify: ctx,
      subtaskMode: settings.subtaskMode,
      projectTitle: (id) => this.plugin.index.projectTitle(id)
    }

    renderToolbar(root, {
      filter: settings.filter,
      sortMode: settings.sortMode,
      projects,
      hasUnprojected: this.plugin.index.all().some((t) => !t.projectId),
      onFilterChange: safeAsync(async (patch) => {
        Object.assign(settings.filter, patch)
        this.render()
        await this.plugin.saveSettings()
      }),
      onSortChange: safeAsync(async (mode) => {
        settings.sortMode = mode
        this.render()
        await this.plugin.saveSettings()
      }),
      onReset: safeAsync(async () => {
        settings.filter = makeDefaultFilter()
        this.render()
        await this.plugin.saveSettings()
      }),
      onRefresh: () => {
        this.plugin.index.rebuild()
        this.render()
        new Notice(KO.notice.refreshed)
      }
    })

    if (restoreSearch) {
      const nextSearch = root.querySelector<HTMLInputElement>('.eis-search')
      if (nextSearch) {
        nextSearch.focus()
        if (selectionStart !== null && selectionEnd !== null) {
          nextSearch.setSelectionRange(selectionStart, selectionEnd)
        }
      }
    }

    if (!palettes.available && !settings.pmBannerDismissed) {
      this.renderBanner(root)
    }

    const all = prepareTasksForSubtaskMode(this.plugin.index.all(), settings.subtaskMode, ctx)
    const visible = applyMatrixFilter(all, settings.filter, filterCtx)
    const filterActive = !isDefaultFilter(settings.filter)

    if (all.length === 0) {
      this.renderEmptyAll(root, KO.empty.all, true)
      return
    }
    if (visible.length === 0) {
      this.renderEmptyAll(root, KO.empty.allFiltered, false)
      return
    }

    const buckets = this.bucket(visible, ctx)
    const totals = this.bucket(all, ctx)

    const grid = root.createDiv({ cls: 'eis-grid' })
    for (const q of QUADRANT_ORDER) {
      const handle = renderQuadrant(grid, {
        id: q,
        tasks: sortCards(buckets[q], settings.sortMode, ctx),
        totalCount: totals[q].length,
        filterActive,
        maxCards: settings.maxCardsPerQuadrant,
        cardProps: (task) => ({
          today: ctx.today,
          priorities: palettes.priorities,
          projectTitle: this.plugin.index.projectTitle(task.projectId),
          parentTitle: this.parentTitle(task),
          availableMoveTargets: QUADRANT_ORDER.filter((target) =>
            canMoveToQuadrant(task, target, ctx)
          )
        }),
        onOpen: (task) => void this.openTaskEditorInProjectManager(task),
        onOpenNote: (task) => void this.app.workspace.openLinkText(task.filePath, '', false),
        onMove: safeAsync(async (task: MatrixTask, target: QuadrantId) => {
          await this.plugin.requestMove(task, target)
        }),
        onDrop: safeAsync(async (filePath: string, target: QuadrantId) => {
          const task = this.plugin.index.get(filePath)
          if (!task) {
            new Notice(KO.error.missing)
            this.plugin.index.rebuild()
            this.render()
            return
          }
          if (task.archived) {
            new Notice(KO.notice.archivedNoDrag)
            return
          }
          if (!canMoveToQuadrant(task, target, ctx)) {
            new Notice(KO.notice.completedNotUrgent)
            return
          }
          if (classify(task, ctx) === target) {
            new Notice(KO.notice.sameQuadrant)
            return
          }
          await this.plugin.requestMove(task, target)
        })
      })
      const saved = scroll.get(q)
      if (saved !== undefined) handle.cardsEl.scrollTop = saved
    }
  }

  private bucket(tasks: readonly MatrixTask[], ctx: ClassifyContext): Record<QuadrantId, MatrixTask[]> {
    const out: Record<QuadrantId, MatrixTask[]> = { do: [], plan: [], delegate: [], drop: [] }
    for (const t of tasks) out[classify(t, ctx)].push(t)
    return out
  }

  private parentTitle(task: MatrixTask): string {
    if (!task.parentId) return ''
    return this.plugin.index.all().find((t) => t.id === task.parentId)?.title ?? ''
  }

  /** 공개 API → 현재 DOM → PM 1.8 TableView 편집 동작 → 실제 노트 순서로 폴백한다. */
  private async openTaskEditorInProjectManager(task: MatrixTask): Promise<void> {
    const projectPath = this.plugin.index.projectFilePath(task.projectId)
    const pmPlugin = this.app.plugins?.getPlugin?.('project-manager')
    if (!projectPath || !pmPlugin) {
      await this.app.workspace.openLinkText(task.filePath, '', false)
      return
    }

    if (
      await tryOpenTaskEditorApi(pmPlugin, {
        projectPath,
        taskId: task.id,
        taskPath: task.filePath
      })
    ) {
      return
    }

    const viewType = 'pm-project'
    const existing = this.app.workspace.getLeavesOfType(viewType).find((leaf) => {
      const state = leaf.getViewState().state as { filePath?: unknown } | undefined
      return state?.filePath === projectPath
    })
    const leaf = existing ?? this.app.workspace.getLeaf('tab')
    if (!existing) {
      await leaf.setViewState({ type: viewType, state: { filePath: projectPath }, active: true })
    }
    await this.app.workspace.revealLeaf(leaf)

    // setViewState가 프로젝트 로드를 기다리지만, Obsidian/서드파티 leaf 복원기는
    // DOM 연결을 다음 프레임으로 미룰 수 있어 짧게 재시도한다.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (this.clickPmTask(task.id, leaf.view.containerEl)) return
      await nextFrame()
    }

    if (tryOpenTaskEditorFromProjectView(leaf.view, task.id)) return

    await this.app.workspace.openLinkText(task.filePath, '', false)
    new Notice(KO.notice.pmTaskEditorFallback)
  }

  private clickPmTask(taskId: string, container: HTMLElement): boolean {
    const taskElements = Array.from(container.querySelectorAll<HTMLElement>('[data-task-id]'))
    const taskEl = taskElements.find((el) => el.dataset['taskId'] === taskId)
    if (!taskEl) return false

    const trigger =
      taskEl.matches('.pm-kanban-card')
        ? taskEl
        : taskEl.querySelector<HTMLElement>('.pm-task-title-text, .pm-gantt-label-title')
    if (!trigger) return false
    trigger.click()
    return true
  }

  private captureScroll(): Map<QuadrantId, number> {
    const map = new Map<QuadrantId, number>()
    for (const el of Array.from(this.contentEl.querySelectorAll<HTMLElement>('.eis-cards'))) {
      const q = el.dataset['quadrant'] as QuadrantId | undefined
      if (q) map.set(q, el.scrollTop)
    }
    return map
  }

  private renderBanner(root: HTMLElement): void {
    const banner = root.createDiv({ cls: 'eis-banner' })
    banner.createSpan({ text: KO.banner.pmMissing })
    const dismiss = banner.createEl('button', { cls: 'eis-btn', text: KO.banner.dismiss })
    dismiss.addEventListener(
      'click',
      safeAsync(async () => {
        this.plugin.settings.pmBannerDismissed = true
        await this.plugin.saveSettings()
        banner.remove()
      })
    )
  }

  private renderEmptyAll(root: HTMLElement, message: string, settingsButton: boolean): void {
    const box = root.createDiv({ cls: 'eis-empty-all' })
    box.createDiv({ cls: 'eis-empty-all-text', text: message })
    if (settingsButton) {
      const btn = box.createEl('button', { cls: 'eis-btn mod-cta', text: KO.empty.openSettings })
      btn.addEventListener('click', () => this.plugin.openSettings())
    } else {
      const btn = box.createEl('button', { cls: 'eis-btn mod-cta', text: KO.empty.resetFilter })
      btn.addEventListener(
        'click',
        safeAsync(async () => {
          this.plugin.settings.filter = makeDefaultFilter()
          this.render()
          await this.plugin.saveSettings()
        })
      )
    }
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}
