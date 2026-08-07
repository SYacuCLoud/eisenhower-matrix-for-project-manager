import { addDays } from './dates'
import { isImportantQuadrant, isUrgentQuadrant, priorityRank } from './classify'
import type { ClassifyContext, QuadrantId } from './types'
import type { NotUrgentStrategy, UrgentDueStrategy } from '../settings/types'

export interface NewTaskDefaults {
  due: string
  priority: string
}

export interface NewTaskDefaultOptions {
  urgentDueStrategy: UrgentDueStrategy
  notUrgentStrategy: NotUrgentStrategy
  notUrgentPaddingDays: number
  importantThresholdId: string
}

/** 새 작업이 선택한 분면에 들어가도록 PM 생성 모달의 기본값을 계산한다. */
export function defaultsForQuadrant(
  quadrant: QuadrantId,
  ctx: ClassifyContext,
  opts: NewTaskDefaultOptions
): NewTaskDefaults {
  const due = isUrgentQuadrant(quadrant)
    ? addDays(ctx.today, urgentOffset(opts.urgentDueStrategy, ctx.urgencyWindowDays))
    : opts.notUrgentStrategy === 'clear' || quadrant === 'drop'
      ? ''
      : addDays(ctx.today, ctx.urgencyWindowDays + Math.max(1, opts.notUrgentPaddingDays))

  const priority = isImportantQuadrant(quadrant)
    ? importantPriority(ctx, opts.importantThresholdId)
    : unimportantPriority(ctx, opts.importantThresholdId)

  return { due, priority }
}

function urgentOffset(strategy: UrgentDueStrategy, windowDays: number): number {
  const edge = Math.max(0, windowDays - 1)
  if (strategy === 'today') return 0
  if (strategy === 'tomorrow') return Math.min(1, edge)
  return edge
}

function importantPriority(ctx: ClassifyContext, thresholdId: string): string {
  if (ctx.priorities.some((p) => p.id === thresholdId)) return thresholdId
  return ctx.priorities[Math.min(1, ctx.priorities.length - 1)]?.id ?? ''
}

function unimportantPriority(ctx: ClassifyContext, thresholdId: string): string {
  let threshold = priorityRank(thresholdId, ctx.priorities)
  if (threshold < 0) threshold = Math.min(1, ctx.priorities.length - 1)
  return ctx.priorities[threshold + 1]?.id ?? ctx.priorities.at(-1)?.id ?? ''
}
