import { beforeEach, describe, expect, it } from 'vitest'
import { isArchivedPath, MatrixIndex } from '../src/index/TaskIndex'
import { asApp, FakeApp } from './fakeApp'
import { makeProjectFm, makeTaskFm } from './fixtures'
import type { QuadrantWritePlan } from '../src/model/types'

describe('isArchivedPath', () => {
  it('Archive 세그먼트를 감지한다', () => {
    expect(isArchivedPath('Projects/demo_tasks/Archive/a.md')).toBe(true)
    expect(isArchivedPath('Projects/demo_tasks/a.md')).toBe(false)
    expect(isArchivedPath('Projects/Archived/a.md')).toBe(false)
  })
})

describe('MatrixIndex', () => {
  let app: FakeApp
  let index: MatrixIndex

  beforeEach(() => {
    app = new FakeApp()
    index = new MatrixIndex(asApp(app))
  })

  it('pm-task 만 담고 프로젝트/일반 노트는 거른다', () => {
    app.addFile('Projects/demo.md', makeProjectFm())
    app.addFile('Projects/demo_tasks/a.md', makeTaskFm({ id: 'a', title: 'A' }))
    app.addFile('Projects/demo_tasks/b.md', makeTaskFm({ id: 'b', title: 'B' }))
    app.addFile('노트/그냥.md', { title: '그냥' })
    app.addFile('노트/무.md', null)

    index.rebuild()

    expect(index.size()).toBe(2)
    expect(index.all().map((t) => t.title).sort()).toEqual(['A', 'B'])
    expect(index.projectTitle('proj-1')).toBe('데모 프로젝트')
    expect(index.projectFilePath('proj-1')).toBe('Projects/demo.md')
    expect(index.allProjects()).toHaveLength(1)
  })

  it('Archive 경로의 작업에 archived 를 세운다', () => {
    app.addFile('Projects/demo_tasks/Archive/old.md', makeTaskFm({ id: 'old' }))
    index.rebuild()
    expect(index.all()[0]!.archived).toBe(true)
  })

  it('불량/누락 필드를 방어적으로 처리한다', () => {
    app.addFile('t.md', {
      'pm-task': true,
      due: '2026-13-40',
      start: new Date(Date.UTC(2026, 7, 7)),
      type: '허구',
      progress: 'nope',
      tags: ['ok', 42, null],
      assignees: 'nope',
      parentId: ''
    })
    index.rebuild()
    const t = index.all()[0]!
    expect(t.due).toBe('')
    expect(t.start).toBe('2026-08-07')
    expect(t.type).toBe('task')
    expect(t.progress).toBe(0)
    expect(t.tags).toEqual(['ok'])
    expect(t.assignees).toEqual([])
    expect(t.parentId).toBeNull()
    expect(t.title).toBe('t')
  })

  it('프론트매터 배열을 복사해서 캐시를 오염시키지 않는다', () => {
    const fm = makeTaskFm({ tags: ['a'] })
    app.addFile('t.md', fm)
    index.rebuild()
    index.all()[0]!.tags.push('오염')
    expect(fm['tags']).toEqual(['a'])
  })

  it('id 가 중복돼도 둘 다 살아남는다 (인덱스 키는 경로)', () => {
    app.addFile('a.md', makeTaskFm({ id: 'dup', title: 'A' }))
    app.addFile('b.md', makeTaskFm({ id: 'dup', title: 'B' }))
    index.rebuild()
    expect(index.size()).toBe(2)
  })

  it('syncFile 은 실제 변경이 있을 때만 true', () => {
    app.addFile('a.md', makeTaskFm({ id: 'a', priority: 'low' }))
    index.rebuild()

    expect(index.syncFile('a.md')).toBe(false)

    app.addFile('a.md', makeTaskFm({ id: 'a', priority: 'high' }))
    expect(index.syncFile('a.md')).toBe(true)
    expect(index.get('a.md')!.priority).toBe('high')
  })

  it('syncFile 은 새 작업을 추가하고 사라진 작업을 지운다', () => {
    index.rebuild()
    app.addFile('a.md', makeTaskFm({ id: 'a' }))
    expect(index.syncFile('a.md')).toBe(true)
    expect(index.size()).toBe(1)

    app.deleteFile('a.md')
    expect(index.syncFile('a.md')).toBe(true)
    expect(index.size()).toBe(0)
  })

  it('pm-task 가 떨어져 나가면 인덱스에서 빠진다', () => {
    app.addFile('a.md', makeTaskFm({ id: 'a' }))
    index.rebuild()
    app.addFile('a.md', { title: '이제 그냥 노트' })
    expect(index.syncFile('a.md')).toBe(true)
    expect(index.size()).toBe(0)
  })

  it('이름 변경을 처리한다', () => {
    app.addFile('a.md', makeTaskFm({ id: 'a' }))
    index.rebuild()

    app.renameFile('a.md', 'Projects/demo_tasks/Archive/a.md')
    index.removePath('a.md')
    index.syncFile('Projects/demo_tasks/Archive/a.md')

    expect(index.size()).toBe(1)
    expect(index.all()[0]!.archived).toBe(true)
  })

  it('프로젝트 노트가 지워지면 프로젝트 목록에서 빠진다', () => {
    app.addFile('Projects/demo.md', makeProjectFm())
    index.rebuild()
    expect(index.allProjects()).toHaveLength(1)

    app.deleteFile('Projects/demo.md')
    expect(index.syncFile('Projects/demo.md')).toBe(true)
    expect(index.allProjects()).toHaveLength(0)
  })

  it('id 가 없는 프로젝트 노트는 무시한다', () => {
    app.addFile('Projects/demo.md', makeProjectFm({ id: undefined }))
    index.rebuild()
    expect(index.allProjects()).toHaveLength(0)
  })

  it('성공한 이동 계획을 메타데이터 캐시보다 먼저 낙관 반영한다', () => {
    app.addFile('a.md', makeTaskFm({ id: 'a', due: '', priority: 'low' }))
    index.rebuild()
    const plan: QuadrantWritePlan = {
      filePath: 'a.md',
      taskId: 'a',
      title: 'A',
      from: 'drop',
      to: 'do',
      changes: [
        { field: 'due', before: '', after: '2026-08-08', reason: 'test' },
        { field: 'priority', before: 'low', after: 'high', reason: 'test' }
      ]
    }

    expect(index.applyPlan(plan)).toBe(true)
    expect(index.get('a.md')).toMatchObject({ due: '2026-08-08', priority: 'high' })
    expect(app.fm('a.md')).toMatchObject({ due: '', priority: 'low' })
  })

  it('다른 작업 id의 이동 계획은 낙관 반영하지 않는다', () => {
    app.addFile('a.md', makeTaskFm({ id: 'a', priority: 'low' }))
    index.rebuild()
    expect(
      index.applyPlan({
        filePath: 'a.md',
        taskId: 'b',
        title: 'B',
        from: 'drop',
        to: 'plan',
        changes: [{ field: 'priority', before: 'low', after: 'high', reason: 'test' }]
      })
    ).toBe(false)
    expect(index.get('a.md')?.priority).toBe('low')
  })
})
