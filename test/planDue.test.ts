import { describe, expect, it } from 'vitest'
import { planDueSet, quickDueTarget, QUICK_DUE_KINDS } from '../src/actions/planDue'
import { applyPlanInMemory } from '../src/actions/planMove'
import { classify } from '../src/model/classify'
import { addDays, nextMonday } from '../src/model/dates'
import { makeCtx, makeMatrixTask, TODAY } from './fixtures'

const ctx = makeCtx()
const OPTS = { keepStartBeforeDue: true }

describe('nextMonday', () => {
  it('오늘 이후 첫 월요일을 낸다', () => {
    expect(nextMonday('2026-09-04')).toBe('2026-09-07') // 금 → 월
    expect(nextMonday('2026-09-06')).toBe('2026-09-07') // 일 → 월
    expect(nextMonday('2026-09-07')).toBe('2026-09-14') // 월 → 다음 주 월
    expect(nextMonday('bad')).toBe('')
  })
})

describe('quickDueTarget', () => {
  it('오늘·내일·다음 월요일은 오늘 기준', () => {
    const task = makeMatrixTask({ due: addDays(TODAY, 20) })
    expect(quickDueTarget('today', task, TODAY)).toBe(TODAY)
    expect(quickDueTarget('tomorrow', task, TODAY)).toBe(addDays(TODAY, 1))
    expect(quickDueTarget('nextMonday', task, TODAY)).toBe(nextMonday(TODAY))
    expect(quickDueTarget('clear', task, TODAY)).toBe('')
  })

  it('+1일/+1주는 현재 마감일 기준, 마감일이 없으면 오늘 기준', () => {
    const due = addDays(TODAY, 20)
    expect(quickDueTarget('plusDay', makeMatrixTask({ due }), TODAY)).toBe(addDays(due, 1))
    expect(quickDueTarget('plusWeek', makeMatrixTask({ due }), TODAY)).toBe(addDays(due, 7))
    expect(quickDueTarget('plusDay', makeMatrixTask({ due: '' }), TODAY)).toBe(addDays(TODAY, 1))
    expect(quickDueTarget('plusWeek', makeMatrixTask({ due: '' }), TODAY)).toBe(addDays(TODAY, 7))
  })
})

describe('planDueSet', () => {
  it('due 만 바꾸고 결과 분면을 기록한다', () => {
    const task = makeMatrixTask({ due: addDays(TODAY, 30), priority: 'critical' })
    const plan = planDueSet(task, TODAY, ctx, OPTS)
    expect(plan.from).toBe('plan')
    expect(plan.to).toBe('do')
    expect(plan.changes.map((c) => c.field)).toEqual(['due'])
    expect(classify(applyPlanInMemory(task, plan), ctx)).toBe('do')
  })

  it('새 마감일이 시작일보다 빠르면 시작일도 당긴다', () => {
    const task = makeMatrixTask({ start: addDays(TODAY, 10), due: addDays(TODAY, 20) })
    const plan = planDueSet(task, TODAY, ctx, OPTS)
    expect(plan.changes.map((c) => c.field)).toEqual(['due', 'start'])
    expect(plan.changes[1]?.after).toBe(TODAY)
    expect(planDueSet(task, TODAY, ctx, { keepStartBeforeDue: false }).changes).toHaveLength(1)
  })

  it('같은 값·잘못된 값·완료 작업은 빈 계획', () => {
    const task = makeMatrixTask({ due: TODAY })
    expect(planDueSet(task, TODAY, ctx, OPTS).changes).toHaveLength(0)
    expect(planDueSet(task, 'nope', ctx, OPTS).changes).toHaveLength(0)
    const done = makeMatrixTask({ due: addDays(TODAY, 9), status: 'done', completed: TODAY })
    const plan = planDueSet(done, TODAY, ctx, OPTS)
    expect(plan.changes).toHaveLength(0)
    expect(plan.to).toBe(plan.from)
  })

  it('지우기는 due 를 빈 문자열로 만든다', () => {
    const task = makeMatrixTask({ due: TODAY, priority: 'critical' })
    const plan = planDueSet(task, '', ctx, OPTS)
    expect(plan.changes).toEqual([expect.objectContaining({ field: 'due', before: TODAY, after: '' })])
    expect(plan.to).toBe('plan')
  })

  it('모든 빠른 조정 종류가 유효한 계획을 만든다', () => {
    const task = makeMatrixTask({ due: addDays(TODAY, 5) })
    for (const kind of QUICK_DUE_KINDS) {
      const target = quickDueTarget(kind, task, TODAY)
      const plan = planDueSet(task, target, ctx, OPTS)
      expect(applyPlanInMemory(task, plan).due).toBe(target)
    }
  })
})
