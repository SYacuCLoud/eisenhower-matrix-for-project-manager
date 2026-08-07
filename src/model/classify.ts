import type { PriorityConfig, StatusConfig } from '../pm/pmTypes'
import { diffDays } from './dates'
import type { ClassifyContext, MatrixTask, QuadrantId } from './types'

/**
 * 순수 함수만. obsidian 을 import 하지 않는다.
 *
 * 축 정의
 *  - 긴급: 마감일이 있고, 오늘부터 N일 미만 남았거나 이미 지남. 완료 상태는 긴급이 아니다.
 *          (PM `utils.ts` 의 `dueUrgency` 와 동일한 `days < N` 규칙)
 *  - 중요: priority 가 팔레트 순서상 임계값 이상.
 */

/** PM `isTerminalStatus` 와 동일: `complete` 플래그로만 판정한다. */
export function isTerminal(status: string, statuses: readonly StatusConfig[]): boolean {
  return statuses.find((s) => s.id === status)?.complete === true
}

/** 오늘 기준 남은 일수. 마감일이 없거나 잘못됐으면 null. */
export function daysUntilDue(due: string, today: string): number | null {
  if (!due) return null
  return diffDays(today, due)
}

export function isUrgent(t: MatrixTask, ctx: ClassifyContext): boolean {
  if (isTerminal(t.status, ctx.statuses)) return false
  const days = daysUntilDue(t.due, ctx.today)
  if (days === null) return false
  return days < ctx.urgencyWindowDays
}

export function isImportant(t: MatrixTask, ctx: ClassifyContext): boolean {
  return ctx.importantIds.has(t.priority)
}

export function quadrantOf(urgent: boolean, important: boolean): QuadrantId {
  if (urgent) return important ? 'do' : 'delegate'
  return important ? 'plan' : 'drop'
}

export function classify(t: MatrixTask, ctx: ClassifyContext): QuadrantId {
  return quadrantOf(isUrgent(t, ctx), isImportant(t, ctx))
}

export function isUrgentQuadrant(q: QuadrantId): boolean {
  return q === 'do' || q === 'delegate'
}

export function isImportantQuadrant(q: QuadrantId): boolean {
  return q === 'do' || q === 'plan'
}

/** 완료 상태는 정의상 긴급일 수 없으므로 긴급 분면으로 이동할 수 없다. */
export function canMoveToQuadrant(
  task: MatrixTask,
  target: QuadrantId,
  ctx: ClassifyContext
): boolean {
  return !(isTerminal(task.status, ctx.statuses) && isUrgentQuadrant(target))
}

/** 팔레트에서의 순위. 배열 index 가 곧 순위(0 = 최상위). 없으면 -1. */
export function priorityRank(id: string, priorities: readonly PriorityConfig[]): number {
  return priorities.findIndex((p) => p.id === id)
}

/**
 * 임계값 id 이상(=index 이하)인 priority id 집합.
 * 임계값 id 가 팔레트에 없으면 상위 두 개를 쓴다.
 */
export function importantIdsForThreshold(
  priorities: readonly PriorityConfig[],
  thresholdId: string
): Set<string> {
  if (priorities.length === 0) return new Set()
  let idx = priorityRank(thresholdId, priorities)
  if (idx < 0) idx = Math.min(1, priorities.length - 1)
  return new Set(priorities.slice(0, idx + 1).map((p) => p.id))
}
