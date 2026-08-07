import { MarkdownView, Menu, Notice, Plugin, type WorkspaceLeaf } from 'obsidian'
import { applyQuadrantMove, type MoveResult } from './actions/applyMove'
import { invertPlan, planQuadrantMove, type MoveOptions } from './actions/planMove'
import { MatrixIndex } from './index/TaskIndex'
import { registerIndexSync } from './index/vaultSync'
import { KO } from './i18n/ko'
import { canMoveToQuadrant, classify, importantIdsForThreshold } from './model/classify'
import { todayString } from './model/dates'
import { mergePendingTransitions, scanTaskTransitions } from './model/transitions'
import { QUADRANT_ORDER, type ClassifyContext, type MatrixTask, type QuadrantId, type QuadrantWritePlan } from './model/types'
import { MoveConfirmModal } from './modals/MoveConfirmModal'
import { readPmPalettes } from './pm/bridge'
import { PM_TASK_KEY } from './pm/pmTypes'
import { EisenSettingTab } from './settings/SettingTab'
import { DEFAULT_SETTINGS, hydrateSettings, type EisenSettings } from './settings/types'
import { safeAsync } from './utils'
import { EISEN_MATRIX_VIEW_TYPE, MatrixView } from './views/MatrixView'

interface LastMove {
  plan: QuadrantWritePlan
}

export default class EisenhowerPlugin extends Plugin {
  settings: EisenSettings = { ...DEFAULT_SETTINGS }
  index!: MatrixIndex
  /** 단일 슬롯 되돌리기. 스택은 이미 낡은 계획을 적용할 위험이 있다. */
  lastMove: LastMove | null = null

  async onload(): Promise<void> {
    await this.loadSettings()

    this.index = new MatrixIndex(this.app)
    registerIndexSync(this, this.index, () => void this.handleIndexChanged())

    this.registerView(EISEN_MATRIX_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MatrixView(leaf, this))

    this.app.workspace.onLayoutReady(() => {
      this.index.rebuild()
      void this.handleIndexChanged()
    })

    this.addRibbonIcon('layout-grid', KO.pluginName, () => {
      void this.activateView()
    })

    this.addCommand({
      id: 'open-matrix',
      name: KO.command.open,
      callback: () => {
        void this.activateView()
      }
    })

    this.addCommand({
      id: 'refresh-matrix',
      name: KO.command.refresh,
      callback: () => {
        this.index.rebuild()
        void this.handleIndexChanged().then(() => new Notice(KO.notice.refreshed))
      }
    })

    this.addCommand({
      id: 'undo-last-move',
      name: KO.command.undo,
      checkCallback: (checking: boolean) => {
        if (!this.lastMove) return false
        if (checking) return true
        void this.undoLastMove()
        return true
      }
    })

    this.addCommand({
      id: 'toggle-completed',
      name: KO.command.toggleCompleted,
      callback: safeAsync(async () => {
        this.settings.filter.showCompleted = !this.settings.filter.showCompleted
        await this.saveSettings()
        this.refreshMatrixViews()
      })
    })

    this.addCommand({
      id: 'move-active-note',
      name: KO.command.moveActive,
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file
        if (!file) return false
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
        if (fm?.[PM_TASK_KEY] !== true) return false
        if (checking) return true
        this.pickQuadrantForPath(file.path)
        return true
      }
    })

    this.addSettingTab(new EisenSettingTab(this.app, this))
  }

  async loadSettings(): Promise<void> {
    this.settings = hydrateSettings(await this.loadData())
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  refreshMatrixViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(EISEN_MATRIX_VIEW_TYPE)) {
      if (leaf.view instanceof MatrixView) leaf.view.render()
    }
  }

  /** 현재 분류를 이전 기준선과 비교한다. record=false 는 사용자가 직접 이동한 직후에 쓴다. */
  async scanTransitions(record = true): Promise<void> {
    const { ctx } = this.buildContext()
    const result = scanTaskTransitions(
      this.index.all(),
      this.settings.transitionSnapshot,
      ctx,
      this.settings.neglectedAfterDays,
      Date.now()
    )
    const snapshotChanged =
      JSON.stringify(this.settings.transitionSnapshot) !== JSON.stringify(result.snapshot)
    this.settings.transitionSnapshot = result.snapshot
    let pendingChanged = false
    if (record && this.settings.showTransitionBriefing && result.transitions.length > 0) {
      this.settings.pendingTransitions = mergePendingTransitions(
        this.settings.pendingTransitions,
        result.transitions
      )
      pendingChanged = true
    }
    if (!snapshotChanged && !pendingChanged) return
    await this.saveSettings()
  }

  async dismissTransitions(): Promise<void> {
    this.settings.pendingTransitions = []
    await this.saveSettings()
    this.refreshMatrixViews()
  }

  private async handleIndexChanged(): Promise<void> {
    await this.scanTransitions(true)
    this.refreshMatrixViews()
  }

  openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } })
      .setting
    setting?.open()
    setting?.openTabById(this.manifest.id)
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(EISEN_MATRIX_VIEW_TYPE)
    if (existing.length > 0 && existing[0]) {
      await this.app.workspace.revealLeaf(existing[0])
      return
    }
    // 2×2 격자는 사이드바에 너무 좁다. 메인 영역 탭으로 연다.
    const leaf = this.app.workspace.getLeaf('tab')
    await leaf.setViewState({ type: EISEN_MATRIX_VIEW_TYPE, active: true })
  }

  /** 분류/이동 계산에 필요한 컨텍스트를 매번 새로 만든다 (PM 설정은 캐시하지 않는다). */
  buildContext(): { ctx: ClassifyContext; opts: MoveOptions; priorities: ReturnType<typeof readPmPalettes>['priorities'] } {
    const palettes = readPmPalettes(this.app)
    const ctx: ClassifyContext = {
      today: todayString(),
      urgencyWindowDays: this.settings.urgencyWindowDays,
      statuses: palettes.statuses,
      priorities: palettes.priorities,
      importantIds: importantIdsForThreshold(palettes.priorities, this.settings.importantThresholdId)
    }
    const opts: MoveOptions = {
      urgentDueStrategy: this.settings.urgentDueStrategy,
      notUrgentStrategy: this.settings.notUrgentStrategy,
      notUrgentPaddingDays: this.settings.notUrgentPaddingDays,
      importantThresholdId: this.settings.importantThresholdId,
      keepStartBeforeDue: this.settings.keepStartBeforeDue
    }
    return { ctx, opts, priorities: palettes.priorities }
  }

  /** 사분면 이동 요청 — 계획 → (확인) → 적용 → 되돌리기 안내. */
  async requestMove(task: MatrixTask, target: QuadrantId): Promise<void> {
    const { ctx, opts, priorities } = this.buildContext()
    if (!canMoveToQuadrant(task, target, ctx)) {
      new Notice(KO.notice.completedNotUrgent)
      return
    }
    const plan = planQuadrantMove(task, target, ctx, opts)

    if (plan.changes.length === 0) {
      new Notice(KO.notice.noChanges)
      return
    }

    if (!this.settings.confirmOnDrop) {
      await this.commitMove(plan)
      return
    }

    new MoveConfirmModal(this.app, {
      plan,
      today: ctx.today,
      priorities,
      onConfirm: safeAsync(async (dontAskAgain: boolean) => {
        if (dontAskAgain) {
          this.settings.confirmOnDrop = false
          await this.saveSettings()
        }
        await this.commitMove(plan)
      })
    }).open()
  }

  private async commitMove(plan: QuadrantWritePlan): Promise<void> {
    const result = await applyQuadrantMove(this.app, plan)
    if (!result.ok) {
      this.reportFailure(result)
      this.index.rebuild()
      this.refreshMatrixViews()
      return
    }

    this.lastMove = { plan }
    if (!this.index.applyPlan(plan)) this.index.rebuild()
    await this.scanTransitions(false)
    this.refreshMatrixViews()
    this.showUndoNotice(KO.notice.moved(plan.title))
  }

  async undoLastMove(): Promise<void> {
    const last = this.lastMove
    if (!last) return
    const inverse = invertPlan(last.plan)
    const result = await applyQuadrantMove(this.app, inverse)
    this.lastMove = null

    if (!result.ok) {
      new Notice(KO.error.undoFailed)
      this.index.rebuild()
      this.refreshMatrixViews()
      return
    }

    if (!this.index.applyPlan(inverse)) this.index.rebuild()
    await this.scanTransitions(false)
    this.refreshMatrixViews()
    new Notice(KO.notice.undone(inverse.title))
  }

  private showUndoNotice(message: string): void {
    const notice = new Notice('', 6000)
    const el = notice.noticeEl
    el.empty()
    el.createSpan({ text: message })
    const btn = el.createEl('button', { cls: 'eis-notice-undo', text: KO.notice.undoLabel })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      notice.hide()
      void this.undoLastMove()
    })
  }

  private reportFailure(result: Extract<MoveResult, { ok: false }>): void {
    switch (result.reason) {
      case 'missing':
        new Notice(KO.error.missing)
        break
      case 'not-a-task':
        new Notice(KO.error.notATask)
        break
      case 'stale':
        new Notice(KO.error.stale)
        break
      case 'conflict':
        new Notice(KO.error.conflict)
        break
      default:
        new Notice(KO.error.write)
    }
  }

  /** 모바일/명령어 경로 — 드래그 없이 사분면을 고른다. */
  private pickQuadrantForPath(path: string): void {
    const task = this.index.get(path)
    if (!task) {
      this.index.syncFile(path)
    }
    const resolved = this.index.get(path)
    if (!resolved) {
      new Notice(KO.error.missing)
      return
    }

    const { ctx } = this.buildContext()
    const current = classify(resolved, ctx)
    const menu = new Menu()
    for (const q of QUADRANT_ORDER) {
      if (q === current) continue
      if (!canMoveToQuadrant(resolved, q, ctx)) continue
      menu.addItem((item: { setTitle(t: string): typeof item; onClick(cb: () => void): typeof item }) =>
        item.setTitle(KO.quadrant[q].subtitle).onClick(() => {
          void this.requestMove(resolved, q)
        })
      )
    }
    menu.showAtPosition({ x: 0, y: 0 })
  }
}
