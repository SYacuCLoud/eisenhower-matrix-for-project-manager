import { priorityRank } from './classify'
import { parseDate } from './dates'
import type { ClassifyContext, MatrixTask, SortMode } from './types'

/** 원본 배열을 변형하지 않는다. */
export function sortCards(
  tasks: readonly MatrixTask[],
  mode: SortMode,
  ctx: ClassifyContext
): MatrixTask[] {
  const byTitle = (a: MatrixTask, b: MatrixTask) => a.title.localeCompare(b.title)

  const byPriority = (a: MatrixTask, b: MatrixTask) => {
    const ra = priorityRank(a.priority, ctx.priorities)
    const rb = priorityRank(b.priority, ctx.priorities)
    // 미상(-1)은 맨 뒤로.
    const na = ra < 0 ? Number.MAX_SAFE_INTEGER : ra
    const nb = rb < 0 ? Number.MAX_SAFE_INTEGER : rb
    return na - nb
  }

  const byDue = (a: MatrixTask, b: MatrixTask) => {
    const da = parseDate(a.due)
    const db = parseDate(b.due)
    // 마감일 없는 작업은 항상 마지막.
    if (da === null && db === null) return 0
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  }

  const comparators: Record<SortMode, Array<(a: MatrixTask, b: MatrixTask) => number>> = {
    due: [byDue, byPriority, byTitle],
    priority: [byPriority, byDue, byTitle],
    title: [byTitle],
    updated: [(a, b) => b.mtime - a.mtime, byTitle]
  }

  const chain = comparators[mode]
  return [...tasks].sort((a, b) => {
    for (const cmp of chain) {
      const r = cmp(a, b)
      if (r !== 0) return r
    }
    return 0
  })
}
