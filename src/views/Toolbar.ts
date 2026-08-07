import { Menu, setIcon } from 'obsidian'
import { KO } from '../i18n/ko'
import { isDefaultFilter } from '../model/filter'
import type { MatrixFilter, ProjectMeta, SortMode } from '../model/types'

export interface ToolbarProps {
  filter: MatrixFilter
  sortMode: SortMode
  projects: readonly ProjectMeta[]
  hasUnprojected: boolean
  onFilterChange: (patch: Partial<MatrixFilter>) => void
  onSortChange: (mode: SortMode) => void
  onReset: () => void
  onRefresh: () => void
}

const SORT_MODES: readonly SortMode[] = ['due', 'priority', 'title', 'updated']

export function renderToolbar(parent: HTMLElement, props: ToolbarProps): void {
  const bar = parent.createDiv({ cls: 'eis-toolbar' })

  const search = bar.createEl('input', {
    cls: 'eis-search',
    attr: { type: 'search', placeholder: KO.toolbar.searchPlaceholder }
  })
  search.value = props.filter.text
  let searchTimer: number | null = null
  search.addEventListener('input', () => {
    if (searchTimer !== null) window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => {
      searchTimer = null
      props.onFilterChange({ text: search.value })
    }, 180)
  })

  renderProjectPicker(bar, props)
  renderSortPicker(bar, props)

  renderToggle(bar, KO.toolbar.showCompleted, props.filter.showCompleted, (v) =>
    props.onFilterChange({ showCompleted: v })
  )
  renderToggle(bar, KO.toolbar.showArchived, props.filter.showArchived, (v) =>
    props.onFilterChange({ showArchived: v })
  )

  const spacer = bar.createDiv({ cls: 'eis-toolbar-spacer' })
  spacer.setAttr('aria-hidden', 'true')

  if (!isDefaultFilter(props.filter)) {
    const reset = bar.createEl('button', { cls: 'eis-btn eis-btn--reset', text: KO.toolbar.reset })
    reset.addEventListener('click', () => props.onReset())
  }

  const refresh = bar.createEl('button', { cls: 'eis-btn eis-btn--icon' })
  refresh.setAttr('aria-label', KO.toolbar.refresh)
  setIcon(refresh, 'refresh-cw')
  refresh.addEventListener('click', () => props.onRefresh())
}

function renderProjectPicker(bar: HTMLElement, props: ToolbarProps): void {
  const selected = props.filter.projectIds
  const label =
    selected.length === 0
      ? KO.toolbar.projectAll
      : selected.length === 1
        ? (props.projects.find((p) => p.id === selected[0])?.title ?? KO.toolbar.projectNone)
        : `${selected.length}개`

  const btn = bar.createEl('button', {
    cls: 'eis-btn eis-btn--dropdown',
    text: `${KO.toolbar.project}: ${label}`
  })

  btn.addEventListener('click', (e) => {
    const menu = new Menu()
    menu.addItem((item) =>
      item
        .setTitle(KO.toolbar.projectAll)
        .setChecked(selected.length === 0)
        .onClick(() => props.onFilterChange({ projectIds: [] }))
    )
    menu.addSeparator()
    for (const p of props.projects) {
      menu.addItem((item) =>
        item
          .setTitle(`${p.icon ? `${p.icon} ` : ''}${p.title}`)
          .setChecked(selected.includes(p.id))
          .onClick(() => props.onFilterChange({ projectIds: toggle(selected, p.id) }))
      )
    }
    if (props.hasUnprojected) {
      menu.addItem((item) =>
        item
          .setTitle(KO.toolbar.projectNone)
          .setChecked(selected.includes(''))
          .onClick(() => props.onFilterChange({ projectIds: toggle(selected, '') }))
      )
    }
    menu.showAtMouseEvent(e)
  })
}

function renderSortPicker(bar: HTMLElement, props: ToolbarProps): void {
  const btn = bar.createEl('button', {
    cls: 'eis-btn eis-btn--dropdown',
    text: `${KO.toolbar.sort}: ${KO.sort[props.sortMode]}`
  })
  btn.addEventListener('click', (e) => {
    const menu = new Menu()
    for (const mode of SORT_MODES) {
      menu.addItem((item) =>
        item
          .setTitle(KO.sort[mode])
          .setChecked(props.sortMode === mode)
          .onClick(() => props.onSortChange(mode))
      )
    }
    menu.showAtMouseEvent(e)
  })
}

function renderToggle(
  bar: HTMLElement,
  label: string,
  value: boolean,
  onChange: (v: boolean) => void
): void {
  const wrap = bar.createEl('label', { cls: 'eis-toggle' })
  const input = wrap.createEl('input', { attr: { type: 'checkbox' } })
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  wrap.createSpan({ text: label })
}

function toggle(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}
