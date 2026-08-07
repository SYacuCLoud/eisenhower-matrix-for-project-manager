import { describe, expect, it } from 'vitest'
import { defaultsForQuadrant } from '../src/model/createTask'
import { makeCtx, TODAY } from './fixtures'

const ctx = makeCtx({ urgencyWindowDays: 3 })
const opts = {
  urgentDueStrategy: 'tomorrow' as const,
  notUrgentStrategy: 'push' as const,
  notUrgentPaddingDays: 4,
  importantThresholdId: 'high'
}

describe('defaultsForQuadrant', () => {
  it('네 분면에 맞는 마감일과 우선순위를 만든다', () => {
    expect(defaultsForQuadrant('do', ctx, opts)).toEqual({ due: '2026-08-08', priority: 'high' })
    expect(defaultsForQuadrant('plan', ctx, opts)).toEqual({ due: '2026-08-14', priority: 'high' })
    expect(defaultsForQuadrant('delegate', ctx, opts)).toEqual({ due: '2026-08-08', priority: 'medium' })
    expect(defaultsForQuadrant('drop', ctx, opts)).toEqual({ due: '', priority: 'medium' })
  })

  it('마감일 지우기와 긴급 기준 경계를 존중한다', () => {
    expect(defaultsForQuadrant('plan', ctx, { ...opts, notUrgentStrategy: 'clear' }).due).toBe('')
    expect(defaultsForQuadrant('do', makeCtx({ urgencyWindowDays: 1 }), opts).due).toBe(TODAY)
  })
})
