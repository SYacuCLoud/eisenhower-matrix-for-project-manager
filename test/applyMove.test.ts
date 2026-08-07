import { beforeEach, describe, expect, it } from 'vitest'
import { applyQuadrantMove } from '../src/actions/applyMove'
import type { QuadrantWritePlan } from '../src/model/types'
import { asApp, FakeApp } from './fakeApp'
import { makeTaskFm } from './fixtures'

const PATH = 'Projects/demo_tasks/task-1.md'

function makePlan(overrides: Partial<QuadrantWritePlan> = {}): QuadrantWritePlan {
  return {
    filePath: PATH,
    taskId: 'task-1',
    title: '테스트 작업',
    from: 'drop',
    to: 'do',
    changes: [
      { field: 'due', before: '', after: '2026-08-08', reason: '' },
      { field: 'priority', before: 'medium', after: 'high', reason: '' }
    ],
    ...overrides
  }
}

describe('applyQuadrantMove — 성공 경로', () => {
  let app: FakeApp

  beforeEach(() => {
    app = new FakeApp()
    app.addFile(PATH, makeTaskFm({ tags: ['launch'], subtaskIds: ['s1'], dependencies: ['d1'] }))
  })

  it('계획한 필드만 바꾸고 나머지는 그대로 둔다', async () => {
    const res = await applyQuadrantMove(asApp(app), makePlan())
    expect(res).toEqual({ ok: true })

    const fm = app.fm(PATH)!
    expect(fm['due']).toBe('2026-08-08')
    expect(fm['priority']).toBe('high')

    // PM 소유 필드가 전부 살아 있어야 한다. 이게 가장 중요한 회귀 지점이다.
    expect(fm['pm-task']).toBe(true)
    expect(fm['projectId']).toBe('proj-1')
    expect(fm['id']).toBe('task-1')
    expect(fm['title']).toBe('테스트 작업')
    expect(fm['status']).toBe('todo')
    expect(fm['tags']).toEqual(['launch'])
    expect(fm['subtaskIds']).toEqual(['s1'])
    expect(fm['dependencies']).toEqual(['d1'])
    expect(fm['createdAt']).toBe('2026-01-01T00:00:00.000Z')
  })

  it('updatedAt 을 갱신한다', async () => {
    await applyQuadrantMove(asApp(app), makePlan())
    expect(app.fm(PATH)!['updatedAt']).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('커스텀 키를 추가하지 않는다 (PM 이 지워버리므로)', async () => {
    const before = new Set(Object.keys(app.fm(PATH)!))
    await applyQuadrantMove(asApp(app), makePlan())
    const added = Object.keys(app.fm(PATH)!).filter((k) => !before.has(k))
    expect(added).toEqual([])
  })

  it('변경이 없는 계획은 파일을 쓰지 않는다', async () => {
    const res = await applyQuadrantMove(asApp(app), makePlan({ changes: [] }))
    expect(res).toEqual({ ok: true })
    expect(app.writeCount).toBe(0)
  })

  it('마감일을 지우는 계획도 처리한다', async () => {
    app.addFile(PATH, makeTaskFm({ due: '2026-08-08' }))
    const res = await applyQuadrantMove(
      asApp(app),
      makePlan({ changes: [{ field: 'due', before: '2026-08-08', after: '', reason: '' }] })
    )
    expect(res).toEqual({ ok: true })
    expect(app.fm(PATH)!['due']).toBe('')
  })

  it('Date 객체로 저장된 마감일도 before 비교에 통과한다', async () => {
    app.addFile(PATH, makeTaskFm({ due: new Date(Date.UTC(2026, 7, 8)) }))
    const res = await applyQuadrantMove(
      asApp(app),
      makePlan({ changes: [{ field: 'due', before: '2026-08-08', after: '2026-08-20', reason: '' }] })
    )
    expect(res).toEqual({ ok: true })
    expect(app.fm(PATH)!['due']).toBe('2026-08-20')
  })
})

describe('applyQuadrantMove — 실패 경로 (어떤 경우에도 쓰지 않는다)', () => {
  let app: FakeApp

  beforeEach(() => {
    app = new FakeApp()
  })

  it('파일이 없으면 missing', async () => {
    const res = await applyQuadrantMove(asApp(app), makePlan())
    expect(res).toEqual({ ok: false, reason: 'missing' })
    expect(app.writeCount).toBe(0)
  })

  it('pm-task 가 아니면 not-a-task', async () => {
    app.addFile(PATH, { title: '그냥 노트' })
    const res = await applyQuadrantMove(asApp(app), makePlan())
    expect(res).toMatchObject({ ok: false, reason: 'not-a-task' })
    expect(app.writeCount).toBe(0)
  })

  it('id 가 다르면 stale', async () => {
    app.addFile(PATH, makeTaskFm({ id: 'other-task' }))
    const res = await applyQuadrantMove(asApp(app), makePlan())
    expect(res).toMatchObject({ ok: false, reason: 'stale' })
    expect(app.writeCount).toBe(0)
  })

  it('계획에 id가 있는데 파일에서 id가 사라졌으면 stale', async () => {
    app.addFile(PATH, makeTaskFm({ id: undefined }))
    const res = await applyQuadrantMove(asApp(app), makePlan())
    expect(res).toMatchObject({ ok: false, reason: 'stale' })
    expect(app.writeCount).toBe(0)
  })

  it('마감일이 그새 바뀌었으면 conflict', async () => {
    app.addFile(PATH, makeTaskFm({ due: '2026-09-09' }))
    const res = await applyQuadrantMove(asApp(app), makePlan())
    expect(res).toMatchObject({ ok: false, reason: 'conflict', detail: 'due' })
    expect(app.writeCount).toBe(0)
  })

  it('우선순위가 그새 바뀌었으면 conflict', async () => {
    app.addFile(PATH, makeTaskFm({ priority: 'critical' }))
    const res = await applyQuadrantMove(asApp(app), makePlan())
    expect(res).toMatchObject({ ok: false, reason: 'conflict', detail: 'priority' })
    expect(app.writeCount).toBe(0)
  })

  it('충돌 시 첫 필드도 반영되지 않는다 (부분 적용 없음)', async () => {
    app.addFile(PATH, makeTaskFm({ priority: 'critical' }))
    await applyQuadrantMove(asApp(app), makePlan())
    expect(app.fm(PATH)!['due']).toBe('')
    expect(app.fm(PATH)!['priority']).toBe('critical')
  })

  it('taskId 가 비어 있으면 id 검사를 건너뛴다', async () => {
    app.addFile(PATH, makeTaskFm({ id: 'whatever' }))
    const res = await applyQuadrantMove(asApp(app), makePlan({ taskId: '' }))
    expect(res).toEqual({ ok: true })
  })
})
