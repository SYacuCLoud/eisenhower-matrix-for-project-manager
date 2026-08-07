import {
  isImportantQuadrant,
  isUrgentQuadrant,
  isUrgent,
  isImportant,
  classify,
  priorityRank,
  canMoveToQuadrant
} from '../model/classify'
import { addDays, parseDate } from '../model/dates'
import type {
  ClassifyContext,
  FieldChange,
  MatrixTask,
  QuadrantId,
  QuadrantWritePlan
} from '../model/types'
import type { NotUrgentStrategy, UrgentDueStrategy } from '../settings/types'

export interface MoveOptions {
  urgentDueStrategy: UrgentDueStrategy
  notUrgentStrategy: NotUrgentStrategy
  notUrgentPaddingDays: number
  importantThresholdId: string
  keepStartBeforeDue: boolean
}

/**
 * 순수 함수. 사분면 이동이 어떤 필드를 어떻게 바꿔야 하는지 계산한다.
 *
 * 불변식: `changes` 를 적용한 작업은 반드시 `classify(...) === target` 을 만족한다.
 * (planMove.test.ts 가 32개 조합 전부에 대해 이 왕복 불변식을 검증한다.)
 *
 * 절대 건드리지 않는 필드: status, completed, progress, subtaskIds, parentId,
 * dependencies, 그리고 파일 본문.
 */
export function planQuadrantMove(
  task: MatrixTask,
  target: QuadrantId,
  ctx: ClassifyContext,
  opts: MoveOptions
): QuadrantWritePlan {
  const changes: FieldChange[] = []

  if (!canMoveToQuadrant(task, target, ctx)) {
    return {
      filePath: task.filePath,
      taskId: task.id,
      title: task.title,
      from: classify(task, ctx),
      to: target,
      changes
    }
  }

  const dueChange = planDueChange(task, target, ctx, opts)
  if (dueChange) changes.push(dueChange)

  const priorityChange = planPriorityChange(task, target, ctx, opts)
  if (priorityChange) changes.push(priorityChange)

  // 새 마감일이 시작일보다 빠르면 시작일도 당긴다. 그대로 두면 PM 의
  // autoSchedule 이 역전된 구간에 반응해 값을 되돌릴 수 있다.
  if (opts.keepStartBeforeDue && dueChange) {
    const startChange = planStartChange(task, dueChange.after)
    if (startChange) changes.push(startChange)
  }

  return {
    filePath: task.filePath,
    taskId: task.id,
    title: task.title,
    from: classify(task, ctx),
    to: target,
    changes
  }
}

function planDueChange(
  task: MatrixTask,
  target: QuadrantId,
  ctx: ClassifyContext,
  opts: MoveOptions
): FieldChange | null {
  const wantUrgent = isUrgentQuadrant(target)
  const nowUrgent = isUrgent(task, ctx)
  if (wantUrgent === nowUrgent) return null

  if (wantUrgent) {
    const offset = urgentOffset(opts.urgentDueStrategy, ctx.urgencyWindowDays)
    const after = addDays(ctx.today, offset)
    if (!after || after === task.due) return null
    return {
      field: 'due',
      before: task.due,
      after,
      reason: '긴급 범위 안으로 마감일을 당깁니다.'
    }
  }

  if (opts.notUrgentStrategy === 'clear') {
    if (!task.due) return null
    return { field: 'due', before: task.due, after: '', reason: '마감일을 지웁니다.' }
  }

  const after = addDays(ctx.today, ctx.urgencyWindowDays + Math.max(1, opts.notUrgentPaddingDays))
  if (!after || after === task.due) return null
  return {
    field: 'due',
    before: task.due,
    after,
    reason: '긴급 범위 밖으로 마감일을 미룹니다.'
  }
}

function planPriorityChange(
  task: MatrixTask,
  target: QuadrantId,
  ctx: ClassifyContext,
  opts: MoveOptions
): FieldChange | null {
  const wantImportant = isImportantQuadrant(target)
  const nowImportant = isImportant(task, ctx)
  if (wantImportant === nowImportant) return null

  const priorities = ctx.priorities
  if (priorities.length === 0) return null

  if (wantImportant) {
    // 임계값 id 자체로 올린다. critical 로 점프하지 않는다 — 사분면 드래그는
    // 대략적인 의도 표현이지 최대치 선언이 아니다.
    const after = priorities.some((p) => p.id === opts.importantThresholdId)
      ? opts.importantThresholdId
      : (priorities[Math.min(1, priorities.length - 1)]?.id ?? '')
    if (!after || after === task.priority) return null
    return { field: 'priority', before: task.priority, after, reason: '중요 기준 이상으로 올립니다.' }
  }

  // 중요 임계값 바로 아래 한 칸으로 내린다.
  let thresholdIdx = priorityRank(opts.importantThresholdId, priorities)
  if (thresholdIdx < 0) thresholdIdx = Math.min(1, priorities.length - 1)
  const after = priorities[thresholdIdx + 1]?.id ?? priorities[priorities.length - 1]?.id ?? ''
  if (!after || after === task.priority) return null
  // 팔레트에 임계값 아래 항목이 없으면 내릴 곳이 없다.
  if (ctx.importantIds.has(after)) return null
  return { field: 'priority', before: task.priority, after, reason: '중요 기준 아래로 내립니다.' }
}

function planStartChange(task: MatrixTask, newDue: string): FieldChange | null {
  if (!task.start || !newDue) return null
  const start = parseDate(task.start)
  const due = parseDate(newDue)
  if (start === null || due === null || start <= due) return null
  return {
    field: 'start',
    before: task.start,
    after: newDue,
    reason: '시작일이 마감일보다 늦어 함께 당깁니다.'
  }
}

/** 결과가 반드시 `days < N` 을 만족하도록 [0, N-1] 로 클램프한다. */
function urgentOffset(strategy: UrgentDueStrategy, windowDays: number): number {
  const max = Math.max(0, windowDays - 1)
  const raw = strategy === 'today' ? 0 : strategy === 'tomorrow' ? 1 : max
  return Math.min(max, Math.max(0, raw))
}

/** 테스트/미리보기용 — 계획을 메모리 상의 작업에 적용한 사본을 만든다. */
export function applyPlanInMemory(task: MatrixTask, plan: QuadrantWritePlan): MatrixTask {
  const next = { ...task }
  for (const c of plan.changes) {
    next[c.field] = c.after
  }
  return next
}

/** 계획을 뒤집는다 (되돌리기용). */
export function invertPlan(plan: QuadrantWritePlan): QuadrantWritePlan {
  return {
    ...plan,
    from: plan.to,
    to: plan.from,
    changes: plan.changes.map((c) => ({
      field: c.field,
      before: c.after,
      after: c.before,
      reason: '되돌리기'
    }))
  }
}
