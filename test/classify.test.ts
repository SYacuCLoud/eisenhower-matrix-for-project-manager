import { describe, expect, it } from 'vitest'
import {
  classify,
  canMoveToQuadrant,
  importantIdsForThreshold,
  isImportant,
  isTerminal,
  isUrgent,
  priorityRank,
  quadrantOf
} from '../src/model/classify'
import { addDays } from '../src/model/dates'
import { FALLBACK_PRIORITIES, FALLBACK_STATUSES } from '../src/pm/pmTypes'
import { makeCtx, makeMatrixTask, TODAY } from './fixtures'

const inDays = (n: number) => addDays(TODAY, n)

describe('isTerminal', () => {
  it('complete 플래그로만 판정한다', () => {
    expect(isTerminal('done', FALLBACK_STATUSES)).toBe(true)
    expect(isTerminal('cancelled', FALLBACK_STATUSES)).toBe(true)
    expect(isTerminal('in-progress', FALLBACK_STATUSES)).toBe(false)
  })

  it('팔레트에 없는 상태는 완료가 아니다', () => {
    expect(isTerminal('made-up', FALLBACK_STATUSES)).toBe(false)
    expect(isTerminal('', FALLBACK_STATUSES)).toBe(false)
  })

  it("id 가 'done' 이어도 complete:false 면 완료가 아니다", () => {
    const statuses = [{ id: 'done', label: 'Done', color: '', icon: '', complete: false }]
    expect(isTerminal('done', statuses)).toBe(false)
  })
})

describe('isUrgent — 경계값', () => {
  const ctx = makeCtx({ urgencyWindowDays: 3 })

  it('N=3 에서 정확히 +3 에 뒤집힌다', () => {
    expect(isUrgent(makeMatrixTask({ due: inDays(-1) }), ctx)).toBe(true)
    expect(isUrgent(makeMatrixTask({ due: inDays(0) }), ctx)).toBe(true)
    expect(isUrgent(makeMatrixTask({ due: inDays(2) }), ctx)).toBe(true)
    expect(isUrgent(makeMatrixTask({ due: inDays(3) }), ctx)).toBe(false)
    expect(isUrgent(makeMatrixTask({ due: inDays(4) }), ctx)).toBe(false)
  })

  it('마감일이 없으면 긴급이 아니다', () => {
    expect(isUrgent(makeMatrixTask({ due: '' }), ctx)).toBe(false)
  })

  it('불량 마감일은 긴급이 아니다', () => {
    expect(isUrgent(makeMatrixTask({ due: '2026-13-40' }), ctx)).toBe(false)
  })

  it('완료 상태는 아무리 지나도 긴급이 아니다', () => {
    expect(isUrgent(makeMatrixTask({ status: 'done', due: inDays(-30) }), ctx)).toBe(false)
    expect(isUrgent(makeMatrixTask({ status: 'cancelled', due: inDays(0) }), ctx)).toBe(false)
  })

  it('윈도우를 넓히면 더 많은 작업이 긴급이 된다', () => {
    const wide = makeCtx({ urgencyWindowDays: 14 })
    expect(isUrgent(makeMatrixTask({ due: inDays(10) }), wide)).toBe(true)
    expect(isUrgent(makeMatrixTask({ due: inDays(14) }), wide)).toBe(false)
  })

  it('N=1 이면 오늘까지만 긴급', () => {
    const tight = makeCtx({ urgencyWindowDays: 1 })
    expect(isUrgent(makeMatrixTask({ due: inDays(0) }), tight)).toBe(true)
    expect(isUrgent(makeMatrixTask({ due: inDays(1) }), tight)).toBe(false)
  })
})

describe('isImportant', () => {
  const ctx = makeCtx()

  it('기본 임계값 high 는 critical + high', () => {
    expect(isImportant(makeMatrixTask({ priority: 'critical' }), ctx)).toBe(true)
    expect(isImportant(makeMatrixTask({ priority: 'high' }), ctx)).toBe(true)
    expect(isImportant(makeMatrixTask({ priority: 'medium' }), ctx)).toBe(false)
    expect(isImportant(makeMatrixTask({ priority: 'low' }), ctx)).toBe(false)
  })

  it('미상 우선순위는 중요하지 않다 (안전한 실패)', () => {
    expect(isImportant(makeMatrixTask({ priority: 'urgent-ish' }), ctx)).toBe(false)
    expect(isImportant(makeMatrixTask({ priority: '' }), ctx)).toBe(false)
  })
})

describe('importantIdsForThreshold', () => {
  it('임계값 이상만 담는다', () => {
    expect([...importantIdsForThreshold(FALLBACK_PRIORITIES, 'critical')]).toEqual(['critical'])
    expect([...importantIdsForThreshold(FALLBACK_PRIORITIES, 'high')]).toEqual(['critical', 'high'])
    expect([...importantIdsForThreshold(FALLBACK_PRIORITIES, 'low')]).toEqual([
      'critical',
      'high',
      'medium',
      'low'
    ])
  })

  it('임계값 id 가 없으면 상위 두 개', () => {
    expect([...importantIdsForThreshold(FALLBACK_PRIORITIES, 'nope')]).toEqual(['critical', 'high'])
  })

  it('팔레트가 하나뿐이면 그 하나', () => {
    const one = [{ id: 'only', label: 'Only', color: '', icon: '' }]
    expect([...importantIdsForThreshold(one, 'nope')]).toEqual(['only'])
  })

  it('빈 팔레트는 빈 집합', () => {
    expect(importantIdsForThreshold([], 'high').size).toBe(0)
  })
})

describe('priorityRank', () => {
  it('배열 index 가 순위', () => {
    expect(priorityRank('critical', FALLBACK_PRIORITIES)).toBe(0)
    expect(priorityRank('low', FALLBACK_PRIORITIES)).toBe(3)
    expect(priorityRank('nope', FALLBACK_PRIORITIES)).toBe(-1)
  })
})

describe('classify', () => {
  const ctx = makeCtx()

  it('네 사분면 매핑', () => {
    expect(quadrantOf(true, true)).toBe('do')
    expect(quadrantOf(false, true)).toBe('plan')
    expect(quadrantOf(true, false)).toBe('delegate')
    expect(quadrantOf(false, false)).toBe('drop')
  })

  it('실제 작업을 분류한다', () => {
    expect(classify(makeMatrixTask({ due: inDays(1), priority: 'high' }), ctx)).toBe('do')
    expect(classify(makeMatrixTask({ due: inDays(30), priority: 'high' }), ctx)).toBe('plan')
    expect(classify(makeMatrixTask({ due: '', priority: 'critical' }), ctx)).toBe('plan')
    expect(classify(makeMatrixTask({ due: inDays(1), priority: 'low' }), ctx)).toBe('delegate')
    expect(classify(makeMatrixTask({ due: '', priority: 'low' }), ctx)).toBe('drop')
  })

  it('지난 마감 + 완료는 절대 do 가 아니다', () => {
    const t = makeMatrixTask({ due: inDays(-10), priority: 'critical', status: 'done' })
    expect(classify(t, ctx)).toBe('plan')
  })
})

describe('completed task classification', () => {
  const ctx = makeCtx({ urgencyWindowDays: 3 })

  it('uses the completion date instead of today for urgency', () => {
    const completed = inDays(-30)
    const due = inDays(-20)
    const task = makeMatrixTask({ status: 'done', completed, due, priority: 'low' })

    expect(isUrgent(task, ctx)).toBe(false)
    expect(classify(task, ctx)).toBe('drop')
  })

  it('places urgent unimportant completed work in delegate', () => {
    const task = makeMatrixTask({
      status: 'done',
      completed: inDays(-1),
      due: inDays(-2),
      priority: 'low'
    })

    expect(isUrgent(task, ctx)).toBe(true)
    expect(classify(task, ctx)).toBe('delegate')
  })

  it('places urgent important completed work in do', () => {
    const task = makeMatrixTask({
      status: 'done',
      completed: inDays(0),
      due: inDays(2),
      priority: 'high'
    })

    expect(classify(task, ctx)).toBe('do')
  })

  it('keeps terminal work without a completion date non-urgent', () => {
    const task = makeMatrixTask({ status: 'done', completed: '', due: inDays(-20), priority: 'low' })

    expect(isUrgent(task, ctx)).toBe(false)
    expect(classify(task, ctx)).toBe('drop')
  })

  it('keeps completed historical classification read-only', () => {
    const task = makeMatrixTask({
      status: 'done',
      completed: inDays(0),
      due: inDays(-1),
      priority: 'low'
    })

    expect(classify(task, ctx)).toBe('delegate')
    expect(['do', 'plan', 'delegate', 'drop'].every((target) =>
      !canMoveToQuadrant(task, target as 'do' | 'plan' | 'delegate' | 'drop', ctx)
    )).toBe(true)
  })
})
