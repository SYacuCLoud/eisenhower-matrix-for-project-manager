import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSelfWrite, consumeSelfWrite, markSelfWrite } from '../src/index/vaultSync'

describe('self-write 이벤트 소비', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    clearSelfWrite('task.md')
  })

  it('자기 쓰기의 첫 이벤트만 소비한다', () => {
    markSelfWrite('task.md')
    expect(consumeSelfWrite('task.md')).toBe(true)
    expect(consumeSelfWrite('task.md')).toBe(false)
  })

  it('만료 뒤 이벤트는 정상 처리한다', () => {
    markSelfWrite('task.md')
    vi.advanceTimersByTime(1501)
    expect(consumeSelfWrite('task.md')).toBe(false)
  })
})
