import { describe, expect, it } from 'vitest'
import { applyPlanInMemory, invertPlan, planQuadrantMove, type MoveOptions } from '../src/actions/planMove'
import { classify } from '../src/model/classify'
import { addDays } from '../src/model/dates'
import { QUADRANT_ORDER, type MatrixTask, type QuadrantId } from '../src/model/types'
import { makeCtx, makeMatrixTask, TODAY } from './fixtures'

const inDays = (n: number) => addDays(TODAY, n)

const OPTS: MoveOptions = {
  urgentDueStrategy: 'tomorrow',
  notUrgentStrategy: 'push',
  notUrgentPaddingDays: 4,
  importantThresholdId: 'high',
  keepStartBeforeDue: true
}

const ctx = makeCtx({ urgencyWindowDays: 3 })

/** 마감일 상태 4가지 × 중요도 2가지 = 시작 상태 8가지 */
const DUE_CASES: Array<{ label: string; due: string }> = [
  { label: '마감없음', due: '' },
  { label: '지남', due: inDays(-2) },
  { label: '범위안', due: inDays(1) },
  { label: '범위밖', due: inDays(30) }
]
const PRIORITY_CASES: Array<{ label: string; priority: string }> = [
  { label: '중요', priority: 'critical' },
  { label: '비중요', priority: 'low' }
]

describe('planQuadrantMove — 왕복 불변식 (32 조합)', () => {
  for (const d of DUE_CASES) {
    for (const p of PRIORITY_CASES) {
      for (const target of QUADRANT_ORDER) {
        it(`${d.label}/${p.label} → ${target}`, () => {
          const task = makeMatrixTask({ due: d.due, priority: p.priority })
          const plan = planQuadrantMove(task, target, ctx, OPTS)
          const after = applyPlanInMemory(task, plan)

          // 이 한 줄이 윈도우 계산의 off-by-one 을 전부 잡는다.
          expect(classify(after, ctx)).toBe(target)

          // 이미 목표 사분면이면 변경이 없어야 한다.
          if (classify(task, ctx) === target) {
            expect(plan.changes).toEqual([])
          }

          // due / priority / start 외의 필드는 계획에 등장하지 않는다.
          for (const c of plan.changes) {
            expect(['due', 'priority', 'start']).toContain(c.field)
          }
        })
      }
    }
  }
})

describe('planQuadrantMove — 긴급 축', () => {
  it("'긴급'으로 이동 시 tomorrow 전략은 내일로 당긴다", () => {
    const task = makeMatrixTask({ due: inDays(30), priority: 'high' })
    const plan = planQuadrantMove(task, 'do', ctx, OPTS)
    expect(plan.changes).toEqual([
      { field: 'due', before: inDays(30), after: inDays(1), reason: expect.any(String) }
    ])
  })

  it("'긴급'으로 이동 시 today 전략은 오늘로", () => {
    const task = makeMatrixTask({ due: '', priority: 'high' })
    const plan = planQuadrantMove(task, 'do', ctx, { ...OPTS, urgentDueStrategy: 'today' })
    expect(plan.changes[0]?.after).toBe(inDays(0))
  })

  it("'긴급'으로 이동 시 windowEdge 전략은 N-1 일 뒤", () => {
    const task = makeMatrixTask({ due: '', priority: 'high' })
    const plan = planQuadrantMove(task, 'do', ctx, { ...OPTS, urgentDueStrategy: 'windowEdge' })
    expect(plan.changes[0]?.after).toBe(inDays(2))
  })

  it('N=1 이면 windowEdge 도 오늘로 클램프된다', () => {
    const tight = makeCtx({ urgencyWindowDays: 1 })
    const task = makeMatrixTask({ due: '', priority: 'high' })
    const plan = planQuadrantMove(task, 'do', tight, { ...OPTS, urgentDueStrategy: 'windowEdge' })
    expect(plan.changes[0]?.after).toBe(inDays(0))
    expect(classify(applyPlanInMemory(task, plan), tight)).toBe('do')
  })

  it("'긴급 아님'으로 이동 시 push 는 N + 여유 만큼 미룬다", () => {
    const task = makeMatrixTask({ due: inDays(1), priority: 'high' })
    const plan = planQuadrantMove(task, 'plan', ctx, OPTS)
    expect(plan.changes[0]?.after).toBe(inDays(7))
  })

  it("'긴급 아님'으로 이동 시 clear 는 마감일을 지운다", () => {
    const task = makeMatrixTask({ due: inDays(1), priority: 'high' })
    const plan = planQuadrantMove(task, 'plan', ctx, { ...OPTS, notUrgentStrategy: 'clear' })
    expect(plan.changes).toEqual([
      { field: 'due', before: inDays(1), after: '', reason: expect.any(String) }
    ])
    expect(classify(applyPlanInMemory(task, plan), ctx)).toBe('plan')
  })

  it('이미 긴급이면 마감일을 건드리지 않는다', () => {
    const task = makeMatrixTask({ due: inDays(-5), priority: 'high' })
    const plan = planQuadrantMove(task, 'do', ctx, OPTS)
    expect(plan.changes).toEqual([])
  })

  it('이미 긴급이 아니면 마감일을 건드리지 않는다', () => {
    const task = makeMatrixTask({ due: inDays(30), priority: 'high' })
    const plan = planQuadrantMove(task, 'plan', ctx, OPTS)
    expect(plan.changes).toEqual([])
  })
})

describe('planQuadrantMove — 중요 축', () => {
  it('중요로 올릴 때 임계값 id 로 간다 (critical 로 점프하지 않음)', () => {
    const task = makeMatrixTask({ due: '', priority: 'low' })
    const plan = planQuadrantMove(task, 'plan', ctx, OPTS)
    expect(plan.changes).toEqual([
      { field: 'priority', before: 'low', after: 'high', reason: expect.any(String) }
    ])
  })

  it('비중요로 내릴 때 임계값 바로 아래 한 칸 (low 로 떨어뜨리지 않음)', () => {
    const task = makeMatrixTask({ due: '', priority: 'critical' })
    const plan = planQuadrantMove(task, 'drop', ctx, OPTS)
    expect(plan.changes).toEqual([
      { field: 'priority', before: 'critical', after: 'medium', reason: expect.any(String) }
    ])
  })

  it('미상 우선순위도 중요로 올릴 수 있다', () => {
    const task = makeMatrixTask({ due: '', priority: 'made-up' })
    const plan = planQuadrantMove(task, 'plan', ctx, OPTS)
    expect(plan.changes[0]).toMatchObject({ field: 'priority', before: 'made-up', after: 'high' })
  })

  it('임계값이 최하위면 비중요로 내릴 곳이 없어 변경하지 않는다', () => {
    const lowCtx = makeCtx({ importantIds: new Set(['critical', 'high', 'medium', 'low']) })
    const task = makeMatrixTask({ due: '', priority: 'low' })
    const plan = planQuadrantMove(task, 'drop', lowCtx, { ...OPTS, importantThresholdId: 'low' })
    expect(plan.changes.filter((c) => c.field === 'priority')).toEqual([])
  })
})

describe('planQuadrantMove — 시작일 정합성', () => {
  it('새 마감일이 시작일보다 빠르면 시작일도 당긴다', () => {
    const task = makeMatrixTask({ due: inDays(30), start: inDays(20), priority: 'high' })
    const plan = planQuadrantMove(task, 'do', ctx, OPTS)
    expect(plan.changes).toContainEqual({
      field: 'start',
      before: inDays(20),
      after: inDays(1),
      reason: expect.any(String)
    })
  })

  it('설정을 끄면 시작일을 건드리지 않는다', () => {
    const task = makeMatrixTask({ due: inDays(30), start: inDays(20), priority: 'high' })
    const plan = planQuadrantMove(task, 'do', ctx, { ...OPTS, keepStartBeforeDue: false })
    expect(plan.changes.some((c) => c.field === 'start')).toBe(false)
  })

  it('시작일이 이미 마감일보다 빠르면 그대로 둔다', () => {
    const task = makeMatrixTask({ due: inDays(30), start: inDays(-5), priority: 'high' })
    const plan = planQuadrantMove(task, 'do', ctx, OPTS)
    expect(plan.changes.some((c) => c.field === 'start')).toBe(false)
  })
})

describe('planQuadrantMove — 메타데이터', () => {
  it('from 은 현재 사분면, to 는 목표', () => {
    const task = makeMatrixTask({ due: inDays(1), priority: 'low' })
    const plan = planQuadrantMove(task, 'plan', ctx, OPTS)
    expect(plan.from).toBe('delegate')
    expect(plan.to).toBe('plan')
    expect(plan.filePath).toBe(task.filePath)
    expect(plan.taskId).toBe(task.id)
  })
})

describe('invertPlan', () => {
  it('되돌리기 계획은 원래 값으로 복구한다', () => {
    const task = makeMatrixTask({ due: inDays(30), priority: 'low' })
    const plan = planQuadrantMove(task, 'do', ctx, OPTS)
    const moved = applyPlanInMemory(task, plan)
    const restored = applyPlanInMemory(moved, invertPlan(plan))
    expect(restored.due).toBe(task.due)
    expect(restored.priority).toBe(task.priority)
    expect(classify(restored, ctx)).toBe(classify(task, ctx))
  })
})

describe('planQuadrantMove — 완료 작업', () => {
  it('완료 상태는 긴급이 될 수 없으므로 긴급 사분면 이동 계획을 만들지 않는다', () => {
    const task: MatrixTask = makeMatrixTask({ status: 'done', due: '', priority: 'high' })
    const plan = planQuadrantMove(task, 'do', ctx, OPTS)
    expect(plan.changes).toEqual([])
  })
})

function quadrantsExcept(q: QuadrantId): QuadrantId[] {
  return QUADRANT_ORDER.filter((x) => x !== q)
}

describe('planQuadrantMove — 임의 시작 상태에서 모든 목표로', () => {
  it('완료가 아닌 작업은 어느 사분면으로든 도달 가능하다', () => {
    for (const d of DUE_CASES) {
      for (const p of PRIORITY_CASES) {
        const task = makeMatrixTask({ due: d.due, priority: p.priority })
        for (const target of quadrantsExcept(classify(task, ctx))) {
          const plan = planQuadrantMove(task, target, ctx, OPTS)
          expect(plan.changes.length).toBeGreaterThan(0)
          expect(classify(applyPlanInMemory(task, plan), ctx)).toBe(target)
        }
      }
    }
  })
})
