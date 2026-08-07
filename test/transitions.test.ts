import { describe, expect, it } from 'vitest'
import {
  compareSnapshots,
  mergePendingTransitions,
  scanTaskTransitions,
  type TaskStateSnapshot,
  type TaskTransition
} from '../src/model/transitions'
import { addDays } from '../src/model/dates'
import { makeCtx, makeMatrixTask, TODAY } from './fixtures'

const now = Date.parse(`${TODAY}T12:00:00Z`)
const ctx = makeCtx({ urgencyWindowDays: 3 })

describe('scanTaskTransitions', () => {
  it('최초 스캔은 기준선만 만들고 알림을 만들지 않는다', () => {
    const result = scanTaskTransitions([makeMatrixTask()], {}, ctx, 14, now)
    expect(Object.keys(result.snapshot)).toEqual(['Projects/demo_tasks/task-1.md'])
    expect(result.transitions).toEqual([])
  })

  it('마감 접근으로 분면과 긴급 단계가 바뀐 것을 탐지한다', () => {
    const task = makeMatrixTask({ priority: 'high', due: addDays(TODAY, 1) })
    const previous: Record<string, TaskStateSnapshot> = {
      [task.filePath]: {
        quadrant: 'plan',
        availability: null,
        urgency: 'none',
        priority: 'high',
        neglected: false
      }
    }
    const result = scanTaskTransitions([task], previous, ctx, 14, now)
    expect(result.transitions[0]?.reasons.map((item) => item.kind)).toEqual(['quadrant', 'urgency'])
  })
})

describe('compareSnapshots', () => {
  it('차단 해제와 방치 전환을 설명한다', () => {
    const before: TaskStateSnapshot = {
      quadrant: 'plan',
      availability: 'blocked-status',
      urgency: 'none',
      priority: 'high',
      neglected: false
    }
    const after: TaskStateSnapshot = { ...before, availability: null, neglected: true }
    expect(compareSnapshots(before, after)).toEqual([
      { kind: 'availability', before: 'blocked-status', after: 'available' },
      { kind: 'neglected', before: 'false', after: 'true' }
    ])
  })
})

describe('mergePendingTransitions', () => {
  it('같은 작업의 최신 변화로 교체하고 최신순으로 정렬한다', () => {
    const item = (filePath: string, detectedAt: number): TaskTransition => ({
      filePath,
      taskId: filePath,
      title: filePath,
      detectedAt,
      reasons: []
    })
    expect(mergePendingTransitions([item('a', 1), item('b', 2)], [item('a', 3)]).map((x) => x.filePath)).toEqual(['a', 'b'])
    expect(mergePendingTransitions([item('a', 1)], [item('a', 3)])[0]?.detectedAt).toBe(3)
  })
})
