import { ItemView, Menu, Notice, TFile, type WorkspaceLeaf } from 'obsidian'
import { KO } from '../i18n/ko'
import { canMoveToQuadrant, classify, importantIdsForThreshold, isTerminal } from '../model/classify'
import { neglectInfo, taskAvailability, urgencyLevel } from '../model/attention'
import { todayString } from '../model/dates'
import { defaultsForQuadrant } from '../model/createTask'
import { DeleteTaskModal } from '../modals/DeleteTaskModal'
import {
  applyMatrixFilter,
  isDefaultFilter,
  makeDefaultFilter,
  prepareTasksForSubtaskMode,
  type FilterContext
} from '../model/filter'
import { sortCards } from '../model/sort'
import { taskFamilyPaths } from '../model/taskRelations'
import { QUADRANT_ORDER, type ClassifyContext, type MatrixTask, type QuadrantId } from '../model/types'
import { readPmPalettes } from '../pm/bridge'
import {
  ensureProjectViewTask,
  tryDeleteTask,
  tryOpenTaskEditorApi,
  tryOpenTaskEditorInTab,
  tryOpenNewTaskModal,
  tryOpenTaskEditorFromProjectView
} from '../pm/taskEditorBridge'
import type { QuickDueKind } from '../actions/planDue'
import { safeAsync } from '../utils'
import { renderQuadrant } from './Quadrant'
import { renderTaskCard } from './TaskCard'
import { renderToolbar } from './Toolbar'
import type EisenhowerPlugin from '../main'

export const EISEN_MATRIX_VIEW_TYPE = 'eisenhower-matrix-for-project-manager'

export class MatrixView extends ItemView {
  /** 늦게 도착한 비동기 갱신이 최신 렌더를 덮어쓰지 못하게 하는 가드. */
  private renderToken = 0
  private milestonesCollapsed = false
  private milestonesExpanded = false
  /** dotpm 공개 API가 없고 편집기 설정이 모달일 때, 편집 모달을 여는 용도로만 재사용하는 단일 비활성 leaf. */
  private pmCompatibilityLeaf: WorkspaceLeaf | null = null
  private transitionNotice: HTMLElement | null = null
  private transitionNoticeKey = ''

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
    await this.plugin.scanTransitions(true)
    this.render()
  }

  override async onClose(): Promise<void> {
    this.hideTransitionToast()
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
      cardDensity: settings.cardDensity,
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
      onDensityChange: safeAsync(async (density) => {
        settings.cardDensity = density
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

    if (settings.showTransitionBriefing && settings.pendingTransitions.length > 0) {
      this.showTransitionToast()
    } else {
      this.hideTransitionToast()
    }

    const all = prepareTasksForSubtaskMode(this.plugin.index.all(), settings.subtaskMode, ctx)
    const visible = applyMatrixFilter(all, settings.filter, { ...filterCtx, subtaskMode: 'flat' })
    const filterActive = !isDefaultFilter(settings.filter)

    if (all.length === 0) {
      this.renderEmptyAll(root, KO.empty.all, true)
      return
    }
    if (visible.length === 0) {
      this.renderEmptyAll(root, KO.empty.allFiltered, false)
      return
    }

    const workAll = all.filter((task) => task.type !== 'milestone')
    const workVisible = visible.filter((task) => task.type !== 'milestone')
    const availability = (task: MatrixTask) => taskAvailability(task, ctx)
    const unavailableAll = settings.separateUnavailableTasks
      ? workAll.filter((task) => !availability(task).available)
      : []
    const unavailableVisible = settings.separateUnavailableTasks
      ? workVisible.filter((task) => !availability(task).available)
      : []
    const matrixAll = settings.separateUnavailableTasks
      ? workAll.filter((task) => availability(task).available)
      : workAll
    const matrixVisible = settings.separateUnavailableTasks
      ? workVisible.filter((task) => availability(task).available)
      : workVisible

    const attentionProps = (task: MatrixTask) => {
      const neglected = settings.detectNeglectedTasks
        ? neglectInfo(task, ctx, settings.neglectedAfterDays, Date.now())
        : { neglected: false, ageDays: 0, missingDue: false }
      return {
        unavailableReason: availability(task).reason,
        urgencyLevel: settings.showUrgencyLevels ? urgencyLevel(task, ctx) : ('none' as const),
        neglectedAgeDays: neglected.neglected ? neglected.ageDays : 0,
        neglectedMissingDue: neglected.neglected && neglected.missingDue
      }
    }

    const visibleMilestones = sortCards(visible.filter((task) => task.type === 'milestone'), 'due', ctx)
    if (visibleMilestones.length > 0) {
      const section = root.createDiv({ cls: 'eis-milestones' })
      const header = section.createDiv({ cls: 'eis-milestones-header' })
      header.createEl('strong', { text: `${KO.milestones.title} · ${visibleMilestones.length}` })
      const expand = header.createEl('button', { text: this.milestonesExpanded ? KO.milestones.oneRow : KO.milestones.expand })
      expand.hidden = this.milestonesCollapsed
      expand.setAttr('aria-pressed', String(this.milestonesExpanded))
      const toggle = header.createEl('button', { text: this.milestonesCollapsed ? KO.milestones.show : KO.milestones.collapse })
      toggle.setAttr('aria-expanded', String(!this.milestonesCollapsed))
      const cards = section.createDiv({ cls: 'eis-milestones-cards' })
      cards.hidden = this.milestonesCollapsed
      if (this.milestonesExpanded) cards.addClass('is-expanded')
      expand.addEventListener('click', () => {
        this.milestonesExpanded = !this.milestonesExpanded
        this.render()
      })
      toggle.addEventListener('click', () => {
        this.milestonesCollapsed = !this.milestonesCollapsed
        this.render()
      })
      for (const task of visibleMilestones) {
        renderTaskCard(cards, {
          task, today: ctx.today, priorities: palettes.priorities, statuses: palettes.statuses,
          density: 'default', projectTitle: this.plugin.index.projectTitle(task.projectId),
          parentTitle: '', currentQuadrant: null, availableMoveTargets: [],
          unavailableReason: null, urgencyLevel: urgencyLevel(task, ctx),
          neglectedAgeDays: 0, neglectedMissingDue: false,
          canAdjustDue: !isTerminal(task.status, ctx.statuses),
          onOpen: (item) => void this.openTaskEditorInProjectManager(item),
          onOpenNote: (item) => void this.app.workspace.openLinkText(item.filePath, '', false),
          onMove: () => {},
          onAdjustDue: safeAsync(async (item, kind) => { await this.plugin.requestDueChange(item, kind) }),
          onDelete: (item) => this.confirmDeleteTask(item)
        })
      }
    }

    if (settings.separateUnavailableTasks && unavailableAll.length > 0) {
      const section = root.createDiv({ cls: 'eis-unavailable' })
      const header = section.createDiv({ cls: 'eis-unavailable-header' })
      const labels = header.createDiv()
      labels.createDiv({ cls: 'eis-unavailable-title', text: KO.unavailable.title })
      labels.createDiv({ cls: 'eis-unavailable-subtitle', text: KO.unavailable.subtitle })
      header.createDiv({
        cls: 'eis-unavailable-count',
        text: filterActive
          ? `${unavailableVisible.length} / ${unavailableAll.length}`
          : String(unavailableVisible.length)
      })
      const cards = section.createDiv({ cls: 'eis-unavailable-cards' })
      if (unavailableVisible.length === 0) {
        cards.createDiv({ cls: 'eis-empty', text: KO.unavailable.empty })
      } else {
        for (const task of sortCards(unavailableVisible, settings.sortMode, ctx).slice(0, settings.maxCardsPerQuadrant)) {
          renderTaskCard(cards, {
            task,
            today: ctx.today,
            priorities: palettes.priorities,
            statuses: palettes.statuses,
            density: settings.cardDensity,
            projectTitle: this.plugin.index.projectTitle(task.projectId),
            parentTitle: this.parentTitle(task),
            currentQuadrant: classify(task, ctx),
            availableMoveTargets: QUADRANT_ORDER.filter((target) => canMoveToQuadrant(task, target, ctx)),
            canAdjustDue: !isTerminal(task.status, ctx.statuses),
            ...attentionProps(task),
            onOpen: (item) => void this.openTaskEditorInProjectManager(item),
            onOpenNote: (item) => void this.app.workspace.openLinkText(item.filePath, '', false),
            onMove: safeAsync(async (item, target) => {
              await this.plugin.requestMove(item, target)
            }),
            onAdjustDue: safeAsync(async (item, kind) => {
              await this.plugin.requestDueChange(item, kind)
            }),
            onDelete: (item) => this.confirmDeleteTask(item)
          })
        }
      }
    }

    const buckets = this.bucket(matrixVisible, ctx)
    const totals = this.bucket(matrixAll, ctx)

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
          statuses: palettes.statuses,
          density: settings.cardDensity,
          projectTitle: this.plugin.index.projectTitle(task.projectId),
          parentTitle: this.parentTitle(task),
          availableMoveTargets: QUADRANT_ORDER.filter((target) =>
            canMoveToQuadrant(task, target, ctx)
          ),
          canAdjustDue: !isTerminal(task.status, ctx.statuses),
          ...attentionProps(task)
        }),
        onOpen: (task) => void this.openTaskEditorInProjectManager(task),
        onOpenNote: (task) => void this.app.workspace.openLinkText(task.filePath, '', false),
        onMove: safeAsync(async (task: MatrixTask, target: QuadrantId) => {
          await this.plugin.requestMove(task, target)
        }),
        onAdjustDue: safeAsync(async (task: MatrixTask, kind: QuickDueKind) => {
          await this.plugin.requestDueChange(task, kind)
        }),
        onDelete: (task) => this.confirmDeleteTask(task),
        onAdd: (event, quadrant) => this.chooseProjectForNewTask(event, quadrant, ctx),
        onDrop: safeAsync(async (filePath: string, target: QuadrantId) => {
          const task = this.plugin.index.get(filePath)
          if (!task) {
            new Notice(KO.error.missing)
            this.plugin.index.rebuild()
            this.render()
            return
          }
          if (task.type === 'milestone') {
            new Notice(KO.milestones.noMove)
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

  private confirmDeleteTask(task: MatrixTask): void {
    new DeleteTaskModal(this.app, {
      task,
      onConfirm: safeAsync(async () => this.deleteTask(task))
    }).open()
  }

  private async deleteTask(task: MatrixTask): Promise<void> {
    const projectPath = this.plugin.index.projectFilePath(task.projectId)
    const projectFile = this.app.vault.getAbstractFileByPath(projectPath)
    const pmPlugin = this.app.plugins?.getPlugin?.('project-manager')
    if (!(projectFile instanceof TFile) || !pmPlugin || !task.id) {
      new Notice(KO.notice.deleteTaskFailed)
      return
    }

    const deletedPaths = taskFamilyPaths(this.plugin.index.all(), task)
    if (!(await tryDeleteTask(pmPlugin, projectFile, task.id))) {
      new Notice(KO.notice.deleteTaskFailed)
      return
    }

    for (const path of deletedPaths) delete this.plugin.settings.transitionSnapshot[path]
    this.plugin.settings.pendingTransitions = this.plugin.settings.pendingTransitions.filter(
      (item) => !deletedPaths.has(item.filePath)
    )
    await this.plugin.saveSettings()
    this.plugin.index.rebuild()
    this.plugin.refreshMatrixViews()
    new Notice(KO.notice.taskDeleted(task.title))
  }

  private chooseProjectForNewTask(
    event: MouseEvent,
    quadrant: QuadrantId,
    ctx: ClassifyContext
  ): void {
    const allProjects = this.plugin.index.allProjects()
    if (allProjects.length === 0) {
      new Notice(KO.notice.noProjects)
      return
    }
    const selectedIds = this.plugin.settings.filter.projectIds.filter(Boolean)
    const selected = allProjects.filter((project) => selectedIds.includes(project.id))
    const candidates = selected.length > 0 ? selected : allProjects
    if (candidates.length === 1 && candidates[0]) {
      void this.openNewTaskModal(candidates[0].id, quadrant, ctx)
      return
    }

    const menu = new Menu()
    menu.setNoIcon()
    for (const project of candidates) {
      menu.addItem((item) =>
        item
          .setTitle(`${project.icon ? `${project.icon} ` : ''}${project.title}`)
          .onClick(() => void this.openNewTaskModal(project.id, quadrant, ctx))
      )
    }
    menu.showAtMouseEvent(event)
  }

  private async openNewTaskModal(
    projectId: string,
    quadrant: QuadrantId,
    ctx: ClassifyContext
  ): Promise<void> {
    const projectPath = this.plugin.index.projectFilePath(projectId)
    const projectFile = this.app.vault.getAbstractFileByPath(projectPath)
    const pmPlugin = this.app.plugins?.getPlugin?.('project-manager')
    if (!(projectFile instanceof TFile) || !pmPlugin) {
      new Notice(KO.notice.noProjects)
      return
    }

    const settings = this.plugin.settings
    const defaults = defaultsForQuadrant(quadrant, ctx, {
      urgentDueStrategy: settings.urgentDueStrategy,
      notUrgentStrategy: settings.notUrgentStrategy,
      notUrgentPaddingDays: settings.notUrgentPaddingDays,
      importantThresholdId: settings.importantThresholdId
    })
    if (await tryOpenNewTaskModal(pmPlugin, projectFile, defaults, this.containerEl.ownerDocument)) {
      return
    }

    const leaf = await this.openProjectLeaf(projectPath)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const buttons = Array.from(
        leaf.view.containerEl.querySelectorAll<HTMLButtonElement>('.pm-toolbar-right button')
      )
      const add = buttons.find((button) => button.textContent?.toLocaleLowerCase().includes('add task'))
      if (add) {
        add.click()
        new Notice(KO.notice.createTaskFallback)
        return
      }
      await nextFrame()
    }
    new Notice(KO.notice.createTaskFallback)
  }

  private async openProjectLeaf(
    projectPath: string,
    reveal = true
  ): Promise<WorkspaceLeaf> {
    const viewType = 'pm-project'
    const existing = this.app.workspace.getLeavesOfType(viewType).find((leaf) => {
      const state = leaf.getViewState().state as { filePath?: unknown } | undefined
      return state?.filePath === projectPath
    })
    const leaf =
      existing ?? (!reveal ? this.pmCompatibilityLeaf : null) ?? this.app.workspace.getLeaf('tab')
    if (!existing) {
      if (!reveal) this.pmCompatibilityLeaf = leaf
      await leaf.setViewState({ type: viewType, state: { filePath: projectPath }, active: reveal })
    }
    // Obsidian 1.7.2+는 비활성 탭을 DeferredView로 복원한다. 실제 dotpm ProjectView와
    // 프로젝트 데이터(2.x: loadScope, 1.8.x: loadProject)가 준비된 뒤에만 DOM/호환 편집 경로를 사용할 수 있다.
    if (!reveal && leaf.isDeferred) await leaf.loadIfDeferred()
    if (reveal) await this.app.workspace.revealLeaf(leaf)
    return leaf
  }

  /**
   * 편집기 열기 순서:
   *  1. 공개 API(capability 계약이 있을 때만)
   *  2. dotpm 2.x 탭 편집기 설정이면 dotpm과 같은 `router.openTask` 경로 — 새 탭으로 전환된다.
   *  3. 모달 설정: 숨은 프로젝트 뷰의 현재 DOM 클릭 → 뷰 내부 호환 경로
   *     (dotpm 2.x Board `openTask`, PM 1.8.x TableView Enter). 매트릭스 탭은 그대로 유지된다.
   */
  private async openTaskEditorInProjectManager(task: MatrixTask): Promise<void> {
    const projectPath = this.plugin.index.projectFilePath(task.projectId)
    const pmPlugin = this.app.plugins?.getPlugin?.('project-manager')
    if (!projectPath || !pmPlugin) {
      new Notice(KO.notice.pmTaskEditorFallback)
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

    // dotpm 편집기 설정이 '탭'이면 사용자가 고른 표면을 따른다. 모달로 강제하지 않는다.
    if (await tryOpenTaskEditorInTab(pmPlugin, task.filePath)) {
      return
    }

    // dotpm 뷰는 편집기를 여는 호환 표면으로만 준비하고 활성 탭은 매트릭스에 둔다.
    const leaf = await this.openProjectLeaf(projectPath, false)

    // setViewState가 프로젝트 로드를 기다리지만, Obsidian/서드파티 leaf 복원기는
    // DOM 연결을 다음 프레임으로 미룰 수 있어 짧게 재시도한다.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (this.clickPmTask(task.id, leaf.view.containerEl)) {
        return
      }
      await nextFrame()
    }

    if (tryOpenTaskEditorFromProjectView(leaf.view, task.id)) {
      return
    }

    // 새 작업 직후에는 백그라운드 dotpm 탭과 store 캐시가 이전 작업 트리를
    // 유지할 수 있다. 작업이 없을 때만 갱신한 뒤 동일한 안전 경로를 재시도한다.
    if (await ensureProjectViewTask(pmPlugin, leaf.view, projectPath, task.id)) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (this.clickPmTask(task.id, leaf.view.containerEl)) return
        await nextFrame()
      }
      if (tryOpenTaskEditorFromProjectView(leaf.view, task.id)) return
    }

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

  private showTransitionToast(): void {
    const items = this.plugin.settings.pendingTransitions
    if (items.length === 0) {
      this.hideTransitionToast()
      return
    }
    const key = items.map((item) => `${item.filePath}:${item.detectedAt}`).join('|')
    if (this.transitionNotice?.isConnected && this.transitionNoticeKey === key) return
    this.hideTransitionToast()

    const doc = this.contentEl.ownerDocument
    doc.querySelector('.eis-transition-toast-shell')?.remove()
    const toast = doc.body.createDiv({ cls: 'eis-transition-toast-shell' })
    toast.setAttribute('role', 'status')
    toast.setAttribute('aria-live', 'polite')
    this.transitionNotice = toast
    this.transitionNoticeKey = key

    const header = toast.createDiv({ cls: 'eis-transition-toast-header' })
    header.createDiv({ cls: 'eis-transition-toast-title', text: KO.briefing.title(items.length) })
    const dismiss = header.createEl('button', {
      cls: 'eis-transition-toast-dismiss',
      text: KO.briefing.dismiss
    })
    dismiss.addEventListener(
      'click',
      safeAsync(async () => {
        if (this.transitionNotice === toast) {
          this.transitionNotice = null
          this.transitionNoticeKey = ''
        }
        toast.remove()
        await this.plugin.dismissTransitions()
      })
    )

    const list = toast.createDiv({ cls: 'eis-transition-toast-list' })
    for (const item of items.slice(0, 3)) {
      const row = list.createDiv({ cls: 'eis-transition-toast-item' })
      row.setAttribute('role', 'button')
      row.tabIndex = 0
      row.createSpan({ cls: 'eis-transition-toast-task', text: item.title })
      row.createSpan({
        cls: 'eis-transition-toast-reason',
        text: item.reasons
          .map((reason) => this.transitionReasonText(reason.kind, reason.before, reason.after))
          .join(' · ')
      })
      const open = () => {
        const task = this.plugin.index.get(item.filePath)
        if (task) void this.openTaskEditorInProjectManager(task)
        else void this.app.workspace.openLinkText(item.filePath, '', false)
      }
      row.addEventListener('click', open)
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        open()
      })
    }
    if (items.length > 3) {
      toast.createDiv({
        cls: 'eis-transition-toast-more',
        text: KO.briefing.more(items.length - 3)
      })
    }
  }

  private hideTransitionToast(): void {
    this.transitionNotice?.remove()
    this.transitionNotice = null
    this.transitionNoticeKey = ''
  }

  private transitionReasonText(kind: string, before: string, after: string): string {
    const value = (raw: string): string => {
      if (raw in KO.quadrant) return KO.quadrant[raw as QuadrantId].subtitle
      return KO.briefing.value[raw as keyof typeof KO.briefing.value] ?? raw
    }
    if (kind === 'neglected') return KO.briefing.neglected
    return KO.briefing.change(KO.briefing.kind[kind as keyof typeof KO.briefing.kind] ?? kind, value(before), value(after))
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
