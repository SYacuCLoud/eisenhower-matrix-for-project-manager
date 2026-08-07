import { makeDefaultFilter } from '../model/filter'
import type { MatrixFilter, QuadrantId, SortMode, SubtaskMode } from '../model/types'

export type UrgentDueStrategy = 'today' | 'tomorrow' | 'windowEdge'
export type NotUrgentStrategy = 'push' | 'clear'

export interface EisenSettings {
  // 분류 기준
  urgencyWindowDays: number
  importantThresholdId: string
  subtaskMode: SubtaskMode
  separateUnavailableTasks: boolean
  showUrgencyLevels: boolean
  detectNeglectedTasks: boolean
  neglectedAfterDays: number

  // 표시
  maxCardsPerQuadrant: number
  sortMode: SortMode
  filter: MatrixFilter
  collapsedQuadrants: QuadrantId[]

  // 드래그 동작
  confirmOnDrop: boolean
  urgentDueStrategy: UrgentDueStrategy
  notUrgentStrategy: NotUrgentStrategy
  notUrgentPaddingDays: number
  keepStartBeforeDue: boolean

  // 기타
  pmBannerDismissed: boolean
}

export const DEFAULT_SETTINGS: EisenSettings = {
  urgencyWindowDays: 3,
  importantThresholdId: 'high',
  subtaskMode: 'flat',
  separateUnavailableTasks: true,
  showUrgencyLevels: true,
  detectNeglectedTasks: true,
  neglectedAfterDays: 14,

  maxCardsPerQuadrant: 200,
  sortMode: 'due',
  filter: makeDefaultFilter(),
  collapsedQuadrants: [],

  confirmOnDrop: true,
  urgentDueStrategy: 'tomorrow',
  notUrgentStrategy: 'push',
  notUrgentPaddingDays: 4,
  keepStartBeforeDue: true,

  pmBannerDismissed: false
}

/** 저장된 data.json 을 신뢰하지 않고 기본값 위에 정상 값만 얹는다. */
export function hydrateSettings(saved: unknown): EisenSettings {
  const s = (saved ?? {}) as Partial<EisenSettings>
  const out: EisenSettings = {
    ...DEFAULT_SETTINGS,
    ...s,
    filter: { ...makeDefaultFilter(), ...(s.filter ?? {}) },
    collapsedQuadrants: Array.isArray(s.collapsedQuadrants) ? [...s.collapsedQuadrants] : []
  }

  out.urgencyWindowDays = clampInt(out.urgencyWindowDays, 1, 14, DEFAULT_SETTINGS.urgencyWindowDays)
  out.neglectedAfterDays = clampInt(out.neglectedAfterDays, 3, 90, DEFAULT_SETTINGS.neglectedAfterDays)
  out.notUrgentPaddingDays = clampInt(out.notUrgentPaddingDays, 1, 30, DEFAULT_SETTINGS.notUrgentPaddingDays)
  out.maxCardsPerQuadrant = clampInt(out.maxCardsPerQuadrant, 20, 1000, DEFAULT_SETTINGS.maxCardsPerQuadrant)

  if (typeof out.importantThresholdId !== 'string' || !out.importantThresholdId) {
    out.importantThresholdId = DEFAULT_SETTINGS.importantThresholdId
  }
  if (!['flat', 'rollup', 'hide'].includes(out.subtaskMode)) out.subtaskMode = DEFAULT_SETTINGS.subtaskMode
  if (!['due', 'priority', 'title', 'updated'].includes(out.sortMode)) out.sortMode = DEFAULT_SETTINGS.sortMode
  if (!['today', 'tomorrow', 'windowEdge'].includes(out.urgentDueStrategy)) {
    out.urgentDueStrategy = DEFAULT_SETTINGS.urgentDueStrategy
  }
  if (!['push', 'clear'].includes(out.notUrgentStrategy)) {
    out.notUrgentStrategy = DEFAULT_SETTINGS.notUrgentStrategy
  }

  return out
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.min(max, Math.max(min, n))
}
