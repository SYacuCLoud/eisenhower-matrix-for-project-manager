import { type App, PluginSettingTab, Setting } from 'obsidian'
import { KO } from '../i18n/ko'
import type { SortMode, SubtaskMode } from '../model/types'
import { readPmPalettes } from '../pm/bridge'
import type EisenhowerPlugin from '../main'
import type { NotUrgentStrategy, UrgentDueStrategy } from './types'

export class EisenSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: EisenhowerPlugin
  ) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    const s = this.plugin.settings
    const palettes = readPmPalettes(this.app)

    const save = async () => {
      await this.plugin.saveSettings()
      this.plugin.refreshMatrixViews()
    }

    // ── 분류 기준 ────────────────────────────────────────────────────────
    new Setting(containerEl).setName(KO.settings.sectionClassify).setHeading()

    new Setting(containerEl)
      .setName(KO.settings.urgencyWindow)
      .setDesc(KO.settings.urgencyWindowDesc)
      .addSlider((sl) =>
        sl
          .setLimits(1, 14, 1)
          .setValue(s.urgencyWindowDays)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.urgencyWindowDays = v
            await save()
          })
      )

    new Setting(containerEl)
      .setName(KO.settings.importantThreshold)
      .setDesc(KO.settings.importantThresholdDesc)
      .addDropdown((dd) => {
        for (const p of palettes.priorities) dd.addOption(p.id, p.label)
        dd.setValue(
          palettes.priorities.some((p) => p.id === s.importantThresholdId)
            ? s.importantThresholdId
            : (palettes.priorities[1]?.id ?? palettes.priorities[0]?.id ?? '')
        )
        dd.onChange(async (v) => {
          s.importantThresholdId = v
          await save()
        })
      })

    new Setting(containerEl)
      .setName(KO.settings.subtaskMode)
      .setDesc(KO.settings.subtaskModeDesc)
      .addDropdown((dd) =>
        dd
          .addOption('flat', KO.settings.subtaskFlat)
          .addOption('rollup', KO.settings.subtaskRollup)
          .addOption('hide', KO.settings.subtaskHide)
          .setValue(s.subtaskMode)
          .onChange(async (v) => {
            s.subtaskMode = v as SubtaskMode
            await save()
          })
      )

    new Setting(containerEl)
      .setName(KO.settings.separateUnavailable)
      .setDesc(KO.settings.separateUnavailableDesc)
      .addToggle((t) =>
        t.setValue(s.separateUnavailableTasks).onChange(async (v) => {
          s.separateUnavailableTasks = v
          await save()
        })
      )

    new Setting(containerEl)
      .setName(KO.settings.showUrgencyLevels)
      .setDesc(KO.settings.showUrgencyLevelsDesc)
      .addToggle((t) =>
        t.setValue(s.showUrgencyLevels).onChange(async (v) => {
          s.showUrgencyLevels = v
          await save()
        })
      )

    new Setting(containerEl)
      .setName(KO.settings.detectNeglected)
      .setDesc(KO.settings.detectNeglectedDesc)
      .addToggle((t) =>
        t.setValue(s.detectNeglectedTasks).onChange(async (v) => {
          s.detectNeglectedTasks = v
          await save()
          this.display()
        })
      )

    if (s.detectNeglectedTasks) {
      new Setting(containerEl)
        .setName(KO.settings.neglectedAfter)
        .setDesc(KO.settings.neglectedAfterDesc)
        .addSlider((sl) =>
          sl
            .setLimits(3, 90, 1)
            .setValue(s.neglectedAfterDays)
            .setDynamicTooltip()
            .onChange(async (v) => {
              s.neglectedAfterDays = v
              await save()
            })
        )
    }

    // ── 표시 ────────────────────────────────────────────────────────────
    new Setting(containerEl).setName(KO.settings.sectionDisplay).setHeading()

    new Setting(containerEl).setName(KO.settings.showCompleted).addToggle((t) =>
      t.setValue(s.filter.showCompleted).onChange(async (v) => {
        s.filter.showCompleted = v
        await save()
      })
    )

    new Setting(containerEl).setName(KO.settings.showArchived).addToggle((t) =>
      t.setValue(s.filter.showArchived).onChange(async (v) => {
        s.filter.showArchived = v
        await save()
      })
    )

    new Setting(containerEl)
      .setName(KO.settings.showTransitionBriefing)
      .setDesc(KO.settings.showTransitionBriefingDesc)
      .addToggle((t) =>
        t.setValue(s.showTransitionBriefing).onChange(async (v) => {
          s.showTransitionBriefing = v
          if (!v) s.pendingTransitions = []
          await save()
        })
      )

    new Setting(containerEl)
      .setName(KO.settings.sortMode)
      .addDropdown((dd) =>
        dd
          .addOption('due', KO.sort.due)
          .addOption('priority', KO.sort.priority)
          .addOption('title', KO.sort.title)
          .addOption('updated', KO.sort.updated)
          .setValue(s.sortMode)
          .onChange(async (v) => {
            s.sortMode = v as SortMode
            await save()
          })
      )

    new Setting(containerEl)
      .setName(KO.settings.maxCards)
      .setDesc(KO.settings.maxCardsDesc)
      .addText((t) =>
        t.setValue(String(s.maxCardsPerQuadrant)).onChange(async (v) => {
          const n = Number(v)
          if (!Number.isFinite(n)) return
          s.maxCardsPerQuadrant = Math.min(1000, Math.max(20, Math.round(n)))
          await save()
        })
      )

    // ── 드래그 동작 ──────────────────────────────────────────────────────
    new Setting(containerEl).setName(KO.settings.sectionDrag).setHeading()

    new Setting(containerEl).setName(KO.settings.confirmOnDrop).addToggle((t) =>
      t.setValue(s.confirmOnDrop).onChange(async (v) => {
        s.confirmOnDrop = v
        await save()
      })
    )

    new Setting(containerEl).setName(KO.settings.urgentDueStrategy).addDropdown((dd) =>
      dd
        .addOption('today', KO.settings.urgentToday)
        .addOption('tomorrow', KO.settings.urgentTomorrow)
        .addOption('windowEdge', KO.settings.urgentWindowEdge)
        .setValue(s.urgentDueStrategy)
        .onChange(async (v) => {
          s.urgentDueStrategy = v as UrgentDueStrategy
          await save()
        })
    )

    new Setting(containerEl).setName(KO.settings.notUrgentStrategy).addDropdown((dd) =>
      dd
        .addOption('push', KO.settings.notUrgentPush)
        .addOption('clear', KO.settings.notUrgentClear)
        .setValue(s.notUrgentStrategy)
        .onChange(async (v) => {
          s.notUrgentStrategy = v as NotUrgentStrategy
          await save()
          this.display()
        })
    )

    if (s.notUrgentStrategy === 'push') {
      new Setting(containerEl)
        .setName(KO.settings.notUrgentPadding)
        .setDesc(KO.settings.notUrgentPaddingDesc(s.urgencyWindowDays + s.notUrgentPaddingDays))
        .addSlider((sl) =>
          sl
            .setLimits(1, 30, 1)
            .setValue(s.notUrgentPaddingDays)
            .setDynamicTooltip()
            .onChange(async (v) => {
              s.notUrgentPaddingDays = v
              await save()
            })
        )
    }

    new Setting(containerEl)
      .setName(KO.settings.keepStartBeforeDue)
      .setDesc(KO.settings.keepStartBeforeDueDesc)
      .addToggle((t) =>
        t.setValue(s.keepStartBeforeDue).onChange(async (v) => {
          s.keepStartBeforeDue = v
          await save()
        })
      )

    // ── 연동 상태 ────────────────────────────────────────────────────────
    new Setting(containerEl).setName(KO.settings.sectionIntegration).setHeading()

    new Setting(containerEl)
      .setName(KO.settings.pmStatus)
      .setDesc(
        palettes.source === 'pm'
          ? KO.settings.pmStatusOn(palettes.statuses.length, palettes.priorities.length)
          : KO.settings.pmStatusOff
      )

    new Setting(containerEl).setName(KO.settings.safetyNote).setDesc(KO.settings.safetyNoteDesc)
  }
}
