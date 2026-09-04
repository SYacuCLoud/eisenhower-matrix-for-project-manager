import { classify, isTerminal } from '../model/classify'
import { addDays, isValidDate, nextMonday } from '../model/dates'
import type { ClassifyContext, FieldChange, MatrixTask, QuadrantWritePlan } from '../model/types'
import { planStartChange } from './planMove'

/** 카드 메뉴에서 고를 수 있는 마감일 빠른 조정. */
export type QuickDueKind = 'today' | 'tomorrow' | 'plusDay' | 'plusWeek' | 'nextMonday' | 'clear'

export const QUICK_DUE_KINDS: readonly QuickDueKind[] = [
  'today',
  'tomorrow',
  'plusDay',
  'plusWeek',
  'nextMonday',
  'clear'
]

/**
 * 조정 결과 마감일. 'clear' 는 ''.
 * +1일/+1주 는 현재 마감일 기준이고, 마감일이 없거나 잘못됐으면 오늘 기준이다.
 */
export function quickDueTarget(kind: QuickDueKind, task: MatrixTask, today: string): string {
  const base = isValidDate(task.due) ? task.due : today
  switch (kind) {
    case 'today':
      return today
    case 'tomorrow':
      return addDays(today, 1)
    case 'plusDay':
      return addDays(base, 1)
    case 'plusWeek':
      return addDays(base, 7)
    case 'nextMonday':
      return nextMonday(today)
    case 'clear':
      return ''
  }
}

export interface DueSetOptions {
  keepStartBeforeDue: boolean
}

/**
 * 마감일을 특정 값으로 바꾸는 계획. 사분면 이동과 같은 QuadrantWritePlan 을 내므로
 * 충돌 검사·인덱스 반영·되돌리기 경로를 그대로 쓴다. 완료 작업은 과거 분류를
 * 보존하기 위해 빈 계획을 낸다.
 */
export function planDueSet(
  task: MatrixTask,
  newDue: string,
  ctx: ClassifyContext,
  opts: DueSetOptions
): QuadrantWritePlan {
  const from = classify(task, ctx)
  const changes: FieldChange[] = []

  const valid = newDue === '' || isValidDate(newDue)
  if (!isTerminal(task.status, ctx.statuses) && valid && newDue !== task.due) {
    changes.push({
      field: 'due',
      before: task.due,
      after: newDue,
      reason: newDue ? '마감일을 직접 지정합니다.' : '마감일을 지웁니다.'
    })
    if (opts.keepStartBeforeDue) {
      const startChange = planStartChange(task, newDue)
      if (startChange) changes.push(startChange)
    }
  }

  const to = changes.length > 0 ? classify({ ...task, due: newDue }, ctx) : from
  return { filePath: task.filePath, taskId: task.id, title: task.title, from, to, changes }
}
