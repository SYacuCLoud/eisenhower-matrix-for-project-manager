import { type App, Modal } from 'obsidian'
import { KO } from '../i18n/ko'
import type { MatrixTask } from '../model/types'

export interface DeleteTaskModalProps {
  task: MatrixTask
  onConfirm: () => void
}

export class DeleteTaskModal extends Modal {
  constructor(
    app: App,
    private readonly props: DeleteTaskModalProps
  ) {
    super(app)
  }

  override onOpen(): void {
    this.contentEl.addClass('eis-delete-confirm')
    this.titleEl.setText(KO.deleteConfirm.title)
    this.contentEl.createEl('p', {
      cls: 'eis-delete-confirm-lead',
      text: KO.deleteConfirm.body(this.props.task.title)
    })
    this.contentEl.createEl('p', {
      cls: 'eis-delete-confirm-warning',
      text: KO.deleteConfirm.warning
    })

    const footer = this.contentEl.createDiv({ cls: 'eis-confirm-footer' })
    const cancel = footer.createEl('button', { text: KO.deleteConfirm.cancel })
    cancel.addEventListener('click', () => this.close())

    const remove = footer.createEl('button', {
      cls: 'mod-warning',
      text: KO.deleteConfirm.apply
    })
    remove.addEventListener('click', () => {
      this.close()
      this.props.onConfirm()
    })
    cancel.focus()
  }

  override onClose(): void {
    this.contentEl.empty()
  }
}
