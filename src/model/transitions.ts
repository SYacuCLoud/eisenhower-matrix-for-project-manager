import { neglectInfo, taskAvailability, urgencyLevel, type UnavailableReason, type UrgencyLevel } from './attention'
import { classify } from './classify'
import type { ClassifyContext, MatrixTask, QuadrantId } from './types'

export interface TaskStateSnapshot {
  quadrant: QuadrantId
  availability: UnavailableReason | null
  urgency: UrgencyLevel
  priority: string
  neglected: boolean
}

export type TransitionReasonKind =
  | 'quadrant'
  | 'availability'
  | 'urgency'
  | 'priority'
  | 'neglected'

export interface TransitionReason {
  kind: TransitionReasonKind
  before: string
  after: string
}

export interface TaskTransition {
  filePath: string
  taskId: string
  title: string
  detectedAt: number
  reasons: TransitionReason[]
}

export interface TransitionScanResult {
  snapshot: Record<string, TaskStateSnapshot>
  transitions: TaskTransition[]
}

export function snapshotTask(
  task: MatrixTask,
  ctx: ClassifyContext,
  neglectedAfterDays: number,
  nowMs: number
): TaskStateSnapshot {
  return {
    quadrant: classify(task, ctx),
    availability: taskAvailability(task, ctx).reason,
    urgency: urgencyLevel(task, ctx),
    priority: task.priority,
    neglected: neglectInfo(task, ctx, neglectedAfterDays, nowMs).neglected
  }
}

/** 최초 스캔은 기준선만 만들며, 이전 스냅샷이 있는 작업만 변화로 보고한다. */
export function scanTaskTransitions(
  tasks: readonly MatrixTask[],
  previous: Readonly<Record<string, TaskStateSnapshot>>,
  ctx: ClassifyContext,
  neglectedAfterDays: number,
  nowMs: number
): TransitionScanResult {
  const snapshot: Record<string, TaskStateSnapshot> = {}
  const transitions: TaskTransition[] = []

  for (const task of tasks) {
    const next = snapshotTask(task, ctx, neglectedAfterDays, nowMs)
    snapshot[task.filePath] = next
    const before = previous[task.filePath]
    if (!before) continue

    const reasons = compareSnapshots(before, next)
    if (reasons.length === 0) continue
    transitions.push({
      filePath: task.filePath,
      taskId: task.id,
      title: task.title,
      detectedAt: nowMs,
      reasons
    })
  }

  return { snapshot, transitions }
}

export function compareSnapshots(
  before: TaskStateSnapshot,
  after: TaskStateSnapshot
): TransitionReason[] {
  const reasons: TransitionReason[] = []
  if (before.quadrant !== after.quadrant) {
    reasons.push({ kind: 'quadrant', before: before.quadrant, after: after.quadrant })
  }
  if (before.availability !== after.availability) {
    reasons.push({
      kind: 'availability',
      before: before.availability ?? 'available',
      after: after.availability ?? 'available'
    })
  }
  if (before.urgency !== after.urgency) {
    reasons.push({ kind: 'urgency', before: before.urgency, after: after.urgency })
  }
  if (before.priority !== after.priority) {
    reasons.push({ kind: 'priority', before: before.priority, after: after.priority })
  }
  if (!before.neglected && after.neglected) {
    reasons.push({ kind: 'neglected', before: 'false', after: 'true' })
  }
  return reasons
}

/** 같은 작업의 새 변화는 이전 항목을 대체한다. */
export function mergePendingTransitions(
  pending: readonly TaskTransition[],
  incoming: readonly TaskTransition[],
  maxItems = 100
): TaskTransition[] {
  const byPath = new Map(pending.map((item) => [item.filePath, item]))
  for (const item of incoming) byPath.set(item.filePath, item)
  return [...byPath.values()]
    .sort((a, b) => b.detectedAt - a.detectedAt)
    .slice(0, Math.max(1, maxItems))
}
