import { setIcon } from 'obsidian'
import { KO } from '../i18n/ko'
import type { MatrixTask, QuadrantId } from '../model/types'
import { safeAsync } from '../utils'
import { renderTaskCard, type TaskCardProps } from './TaskCard'

export interface QuadrantProps {
  id: QuadrantId
  tasks: readonly MatrixTask[]
  /** 필터 적용 전 총 개수. 필터가 걸려 있을 때만 `n / total` 로 보여준다. */
  totalCount: number
  filterActive: boolean
  maxCards: number
  cardProps: (task: MatrixTask) => Omit<
    TaskCardProps,
    'task' | 'currentQuadrant' | 'onOpen' | 'onOpenNote' | 'onMove'
  >
  onOpen: TaskCardProps['onOpen']
  onOpenNote: TaskCardProps['onOpenNote']
  onMove: TaskCardProps['onMove']
  onAdd: (event: MouseEvent, quadrant: QuadrantId) => void
  onDrop: (filePath: string, target: QuadrantId) => void | Promise<void>
}

export interface QuadrantHandle {
  root: HTMLElement
  cardsEl: HTMLElement
}

export function renderQuadrant(parent: HTMLElement, props: QuadrantProps): QuadrantHandle {
  const labels = KO.quadrant[props.id]
  const root = parent.createDiv({ cls: `eis-quadrant eis-quadrant--${props.id}` })
  root.setAttr('role', 'region')
  root.setAttr('aria-label', `${labels.subtitle}: ${labels.title}`)

  const header = root.createDiv({ cls: 'eis-quadrant-header' })
  const titles = header.createDiv({ cls: 'eis-quadrant-titles' })
  titles.createDiv({ cls: 'eis-quadrant-subtitle', text: labels.subtitle })
  titles.createDiv({ cls: 'eis-quadrant-title', text: labels.title })
  const actions = header.createDiv({ cls: 'eis-quadrant-actions' })
  actions.createDiv({
    cls: 'eis-quadrant-count',
    text: props.filterActive ? `${props.tasks.length} / ${props.totalCount}` : String(props.tasks.length)
  })
  const add = actions.createEl('button', { cls: 'eis-quadrant-add' })
  add.setAttr('aria-label', KO.quadrantAction.addTask(labels.subtitle))
  add.setAttr('title', KO.quadrantAction.addTask(labels.subtitle))
  setIcon(add, 'plus')
  add.addEventListener('click', (event) => props.onAdd(event, props.id))

  const cardsEl = root.createDiv({ cls: 'eis-cards' })
  cardsEl.dataset['quadrant'] = props.id

  if (props.tasks.length === 0) {
    cardsEl.createDiv({ cls: 'eis-empty', text: KO.empty[props.id] })
  } else {
    const shown = props.tasks.slice(0, props.maxCards)
    for (const task of shown) {
      renderTaskCard(cardsEl, {
        ...props.cardProps(task),
        task,
        currentQuadrant: props.id,
        onOpen: props.onOpen,
        onOpenNote: props.onOpenNote,
        onMove: props.onMove
      })
    }
    const hidden = props.tasks.length - shown.length
    if (hidden > 0) {
      cardsEl.createDiv({ cls: 'eis-more', text: KO.card.more(hidden) })
    }
  }

  cardsEl.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    cardsEl.addClass('eis-drop-target')
  })
  cardsEl.addEventListener('dragleave', (e) => {
    if (e.target === cardsEl) cardsEl.removeClass('eis-drop-target')
  })
  cardsEl.addEventListener(
    'drop',
    safeAsync(async (e: DragEvent) => {
      e.preventDefault()
      cardsEl.removeClass('eis-drop-target')
      const filePath = e.dataTransfer?.getData('text/plain')
      if (!filePath) return
      await props.onDrop(filePath, props.id)
    })
  )

  return { root, cardsEl }
}
