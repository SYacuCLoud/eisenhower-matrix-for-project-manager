import { type App, Modal } from 'obsidian'
import { KO } from '../i18n/ko'
import { formatDueKo } from '../model/dates'
import type { FieldChange, QuadrantWritePlan } from '../model/types'
import { priorityLabel } from '../pm/bridge'
import type { PriorityConfig } from '../pm/pmTypes'

export interface MoveConfirmProps {
  plan: QuadrantWritePlan
  today: string
  priorities: readonly PriorityConfig[]
  onConfirm: (dontAskAgain: boolean) => void
}

/** 적용 전에 정확히 무엇이 바뀌는지 보여준다. */
export class MoveConfirmModal extends Modal {
  private dontAskAgain = false

  constructor(
    app: App,
    private readonly props: MoveConfirmProps
  ) {
    super(app)
  }

  override onOpen(): void {
    const { contentEl, plan } = { contentEl: this.contentEl, plan: this.props.plan }
    contentEl.addClass('eis-confirm')
    this.titleEl.setText(KO.confirm.title)

    contentEl.createEl('p', {
      cls: 'eis-confirm-lead',
      text: KO.confirm.body(plan.title, KO.quadrant[plan.to].subtitle)
    })

    const table = contentEl.createEl('table', { cls: 'eis-diff' })
    const head = table.createEl('thead').createEl('tr')
    head.createEl('th', { text: KO.confirm.colField })
    head.createEl('th', { text: KO.confirm.colBefore })
    head.createEl('th', { text: KO.confirm.colAfter })

    const tbody = table.createEl('tbody')
    for (const c of plan.changes) {
      const row = tbody.createEl('tr')
      row.createEl('td', { cls: 'eis-diff-field', text: fieldLabel(c) })
      row.createEl('td', { cls: 'eis-diff-before', text: this.renderValue(c, c.before) })
      row.createEl('td', { cls: 'eis-diff-after', text: this.renderValue(c, c.after) })
    }

    const opts = contentEl.createDiv({ cls: 'eis-confirm-options' })
    const label = opts.createEl('label', { cls: 'eis-toggle' })
    const cb = label.createEl('input', { attr: { type: 'checkbox' } })
    cb.addEventListener('change', () => {
      this.dontAskAgain = cb.checked
    })
    label.createSpan({ text: KO.confirm.dontAskAgain })

    const footer = contentEl.createDiv({ cls: 'eis-confirm-footer' })
    const cancel = footer.createEl('button', { text: KO.confirm.cancel })
    cancel.addEventListener('click', () => this.close())

    const apply = footer.createEl('button', { cls: 'mod-cta', text: KO.confirm.apply })
    apply.addEventListener('click', () => {
      const flag = this.dontAskAgain
      this.close()
      this.props.onConfirm(flag)
    })
    apply.focus()

    this.scope.register([], 'Enter', () => {
      apply.click()
      return false
    })
  }

  override onClose(): void {
    this.contentEl.empty()
  }

  private renderValue(c: FieldChange, raw: string): string {
    if (!raw) return KO.confirm.emptyValue
    if (c.field === 'priority') return priorityLabel(raw, this.props.priorities)
    return formatDueKo(raw, this.props.today)
  }
}

function fieldLabel(c: FieldChange): string {
  switch (c.field) {
    case 'due':
      return KO.confirm.fieldDue
    case 'priority':
      return KO.confirm.fieldPriority
    case 'start':
      return KO.confirm.fieldStart
  }
}
