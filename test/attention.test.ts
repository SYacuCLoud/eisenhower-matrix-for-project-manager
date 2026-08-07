import { describe, expect, it } from 'vitest'
import { neglectInfo, taskAvailability, urgencyLevel } from '../src/model/attention'
import { addDays } from '../src/model/dates'
import { makeCtx, makeMatrixTask, TODAY } from './fixtures'

const ctx = makeCtx({ urgencyWindowDays: 3 })
const now = Date.parse(`${TODAY}T12:00:00Z`)

describe('taskAvailability', () => {
  it('Blocked 상태를 실행 불가로 분리한다', () => {
    expect(taskAvailability(makeMatrixTask({ status: 'blocked' }), ctx)).toEqual({
      available: false,
      reason: 'blocked-status'
    })
  })

  it('미래 시작일을 실행 불가로 분리한다', () => {
    expect(taskAvailability(makeMatrixTask({ start: addDays(TODAY, 1) }), ctx).reason).toBe(
      'future-start'
    )
    expect(taskAvailability(makeMatrixTask({ start: TODAY }), ctx).available).toBe(true)
  })

  it('완료 작업은 Blocked 영역으로 보내지 않는다', () => {
    expect(taskAvailability(makeMatrixTask({ status: 'done', start: addDays(TODAY, 5) }), ctx).available).toBe(true)
  })
})

describe('urgencyLevel', () => {
  it('기한 초과·오늘·임박을 구분한다', () => {
    expect(urgencyLevel(makeMatrixTask({ due: addDays(TODAY, -1) }), ctx)).toBe('overdue')
    expect(urgencyLevel(makeMatrixTask({ due: TODAY }), ctx)).toBe('today')
    expect(urgencyLevel(makeMatrixTask({ due: addDays(TODAY, 2) }), ctx)).toBe('soon')
    expect(urgencyLevel(makeMatrixTask({ due: addDays(TODAY, 3) }), ctx)).toBe('none')
  })
})

describe('neglectInfo', () => {
  it('오래 수정하지 않은 중요 작업을 탐지한다', () => {
    const task = makeMatrixTask({
      priority: 'high',
      due: '',
      mtime: now - 20 * 86_400_000
    })
    expect(neglectInfo(task, ctx, 14, now)).toEqual({
      neglected: true,
      ageDays: 20,
      missingDue: true
    })
  })

  it('최근 작업·비중요 작업·완료 작업은 제외한다', () => {
    expect(neglectInfo(makeMatrixTask({ priority: 'high', mtime: now }), ctx, 14, now).neglected).toBe(false)
    expect(neglectInfo(makeMatrixTask({ priority: 'low', mtime: now - 30 * 86_400_000 }), ctx, 14, now).neglected).toBe(false)
    expect(neglectInfo(makeMatrixTask({ priority: 'high', status: 'done', mtime: now - 30 * 86_400_000 }), ctx, 14, now).neglected).toBe(false)
  })
})
