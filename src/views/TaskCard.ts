import { Menu, Platform } from 'obsidian'
import { KO } from '../i18n/ko'
import { relativeDueKo } from '../model/dates'
import type { UnavailableReason, UrgencyLevel } from '../model/attention'
import { QUADRANT_ORDER, type CardDensity, type MatrixTask, type QuadrantId } from '../model/types'
import { priorityColor, priorityLabel, statusLabel } from '../pm/bridge'
import type { PriorityConfig, StatusConfig } from '../pm/pmTypes'
import {
  bindTouchLongPress,
  isCardActivationKey
} from './cardInteractions'

export interface TaskCardProps {
  task: MatrixTask
  today: string
  priorities: readonly PriorityConfig[]
  statuses: readonly StatusConfig[]
  density: CardDensity
  projectTitle: string
  parentTitle: string
  currentQuadrant: QuadrantId
  availableMoveTargets: readonly QuadrantId[]
  unavailableReason: UnavailableReason | null
  urgencyLevel: UrgencyLevel
  neglectedAgeDays: number
  neglectedMissingDue: boolean
  /** 카드 기본 동작: Project Manager 프로젝트 화면 열기(불가능하면 노트로 폴백). */
  onOpen: (task: MatrixTask) => void
  /** 우클릭 메뉴에서 실제 Markdown 작업 노트를 연다. */
  onOpenNote: (task: MatrixTask) => void
  onMove: (task: MatrixTask, target: QuadrantId) => void
}

export function renderTaskCard(parent: HTMLElement, props: TaskCardProps): HTMLElement {
  const { task } = props
  const compact = props.density === 'compact'
  const detailed = props.density === 'detailed'
  const card = parent.createDiv({ cls: 'eis-card' })
  card.addClass(`eis-card--${props.density}`)
  card.dataset['filePath'] = task.filePath
  card.setAttr('role', 'button')
  card.setAttr('tabindex', '0')
  card.setAttr('aria-label', KO.card.openTask(task.title))
  card.setAttr('aria-haspopup', 'menu')
  if (task.archived) card.addClass('eis-card--archived')
  if (props.unavailableReason) card.addClass('eis-card--unavailable')

  // 보관된 작업을 옮기면 PM 의 아카이브 의미와 싸우게 된다.
  const draggable = !task.archived && !props.unavailableReason && !Platform.isMobile
  card.draggable = draggable

  const color = priorityColor(task.priority, props.priorities)
  const bar = card.createDiv({ cls: 'eis-card-bar' })
  if (color) bar.style.backgroundColor = color

  const body = card.createDiv({ cls: 'eis-card-body' })

  if (!compact && props.parentTitle) {
    body.createDiv({ cls: 'eis-card-parent', text: `↳ ${props.parentTitle}` })
  }

  const titleRow = body.createDiv({ cls: 'eis-card-title-row' })
  titleRow.createSpan({ cls: 'eis-card-title', text: task.title })
  if (task.type === 'milestone') {
    titleRow.createSpan({ cls: 'eis-badge eis-badge--milestone', text: 'M' })
  }
  if (!compact && task.archived) {
    titleRow.createSpan({ cls: 'eis-badge eis-badge--archived', text: KO.card.archived })
  }
  if (!compact && task.rolledUpSubtaskCount) {
    titleRow.createSpan({
      cls: 'eis-badge eis-badge--subtasks',
      text: KO.card.subtasks(task.rolledUpSubtaskCount)
    })
  }
  if (!compact && task.rolledUpUrgentCount) {
    titleRow.createSpan({
      cls: 'eis-badge eis-badge--rollup-urgent',
      text: KO.card.rollupUrgent(task.rolledUpUrgentCount)
    })
  }
  if (!compact && task.rolledUpImportantCount) {
    titleRow.createSpan({
      cls: 'eis-badge eis-badge--rollup-important',
      text: KO.card.rollupImportant(task.rolledUpImportantCount)
    })
  }
  if (!compact && task.rolledUpCompletedCount) {
    titleRow.createSpan({
      cls: 'eis-badge eis-badge--rollup-completed',
      text: KO.card.rollupCompleted(task.rolledUpCompletedCount)
    })
  }
  if (!compact && props.unavailableReason === 'blocked-status') {
    titleRow.createSpan({ cls: 'eis-badge eis-badge--blocked', text: KO.card.blockedStatus })
  } else if (!compact && props.unavailableReason === 'future-start') {
    titleRow.createSpan({
      cls: 'eis-badge eis-badge--future',
      text: KO.card.futureStart(task.start)
    })
  }
  if (!compact && props.urgencyLevel !== 'none') {
    const urgencyText = {
      overdue: KO.card.urgencyOverdue,
      today: KO.card.urgencyToday,
      soon: KO.card.urgencySoon
    }[props.urgencyLevel]
    titleRow.createSpan({
      cls: `eis-badge eis-badge--urgency eis-badge--urgency-${props.urgencyLevel}`,
      text: urgencyText
    })
  }
  if (!compact && props.neglectedAgeDays > 0) {
    titleRow.createSpan({
      cls: 'eis-badge eis-badge--neglected',
      text: KO.card.neglected(props.neglectedAgeDays),
      attr: {
        title: props.neglectedMissingDue
          ? `${KO.card.neglected(props.neglectedAgeDays)} · ${KO.card.missingDue}`
          : KO.card.neglected(props.neglectedAgeDays)
      }
    })
  }

  const meta = compact ? null : body.createDiv({ cls: 'eis-card-meta' })

  if (meta && task.due) {
    const rel = relativeDueKo(task.due, props.today)
    const chip = meta.createSpan({ cls: 'eis-chip eis-chip--due', text: `${task.due} · ${rel.text}` })
    chip.addClass(`eis-chip--${rel.tone}`)
  }

  const pLabel = priorityLabel(task.priority, props.priorities)
  if (meta && pLabel) {
    const chip = meta.createSpan({ cls: 'eis-chip eis-chip--priority', text: pLabel })
    if (color) chip.style.borderColor = color
  }

  if (meta && props.projectTitle) {
    meta.createSpan({ cls: 'eis-chip eis-chip--project', text: props.projectTitle })
  }

  if (meta) {
    for (const tag of task.tags.slice(0, detailed ? 6 : 3)) {
      meta.createSpan({ cls: 'eis-chip eis-chip--tag', text: `#${tag}` })
    }
  }

  if (meta && detailed) {
    const status = statusLabel(task.status, props.statuses)
    if (status) meta.createSpan({ cls: 'eis-chip eis-chip--status', text: status })
    if (task.start) meta.createSpan({ cls: 'eis-chip eis-chip--start', text: KO.card.start(task.start) })
    for (const assignee of task.assignees.slice(0, 4)) {
      meta.createSpan({ cls: 'eis-chip eis-chip--assignee', text: `@${assignee}` })
    }
    if (task.progress > 0) {
      meta.createSpan({ cls: 'eis-chip eis-chip--progress', text: KO.card.progress(task.progress) })
    }
  }

  let suppressClickUntil = 0
  card.addEventListener('click', (e) => {
    if (e.defaultPrevented) return
    if (Date.now() <= suppressClickUntil) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    props.onOpen(task)
  })

  const buildMenu = (): Menu => {
    const menu = new Menu()
    let hasMoveItem = false
    if (!task.archived) {
      for (const q of QUADRANT_ORDER) {
        if (q === props.currentQuadrant) continue
        if (!props.availableMoveTargets.includes(q)) continue
        hasMoveItem = true
        menu.addItem((item) =>
          item
            .setTitle(`${KO.menu.moveTo}: ${KO.quadrant[q].subtitle}`)
            .setIcon('move')
            .onClick(() => props.onMove(task, q))
        )
      }
    }
    if (hasMoveItem) menu.addSeparator()
    menu.addItem((item) =>
      item
        .setTitle(KO.menu.openProject)
        .setIcon('chart-gantt')
        .onClick(() => props.onOpen(task))
    )
    menu.addItem((item) =>
      item
        .setTitle(KO.menu.openNote)
        .setIcon('file-text')
        .onClick(() => props.onOpenNote(task))
    )
    return menu
  }

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (Date.now() <= suppressClickUntil) return
    buildMenu().showAtMouseEvent(e)
  })

  card.addEventListener('keydown', (e) => {
    if (isCardActivationKey(e.key)) {
      e.preventDefault()
      props.onOpen(task)
      return
    }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault()
      const rect = card.getBoundingClientRect()
      buildMenu().showAtPosition({ x: rect.left + 12, y: rect.top + 12 })
    }
  })

  bindTouchLongPress(card, ({ x, y }) => {
    if (!card.isConnected) return
    suppressClickUntil = Date.now() + 800
    buildMenu().showAtPosition({ x, y })
  })

  if (draggable) {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', task.filePath)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      // 같은 틱에 클래스를 붙이면 드래그 이미지가 깨진다.
      window.setTimeout(() => card.addClass('eis-card--dragging'), 0)
    })
    card.addEventListener('dragend', () => card.removeClass('eis-card--dragging'))
  }

  return card
}
