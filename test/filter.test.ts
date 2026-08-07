import { describe, expect, it } from 'vitest'
import {
  applyMatrixFilter,
  isDefaultFilter,
  makeDefaultFilter,
  matchesMatrixFilter,
  prepareTasksForSubtaskMode,
  type FilterContext
} from '../src/model/filter'
import { sortCards } from '../src/model/sort'
import type { MatrixTask } from '../src/model/types'
import { makeCtx, makeMatrixTask } from './fixtures'

const ctx: FilterContext = {
  classify: makeCtx(),
  subtaskMode: 'flat',
  projectTitle: (id) => (id === 'proj-1' ? '데모 프로젝트' : '')
}

describe('makeDefaultFilter / isDefaultFilter', () => {
  it('기본 필터를 알아본다', () => {
    expect(isDefaultFilter(makeDefaultFilter())).toBe(true)
    expect(isDefaultFilter({ ...makeDefaultFilter(), text: 'x' })).toBe(false)
    expect(isDefaultFilter({ ...makeDefaultFilter(), showCompleted: true })).toBe(false)
  })
})

describe('matchesMatrixFilter', () => {
  const f = makeDefaultFilter()

  it('기본값은 완료/보관을 숨긴다', () => {
    expect(matchesMatrixFilter(makeMatrixTask(), f, ctx)).toBe(true)
    expect(matchesMatrixFilter(makeMatrixTask({ status: 'done' }), f, ctx)).toBe(false)
    expect(matchesMatrixFilter(makeMatrixTask({ archived: true }), f, ctx)).toBe(false)
  })

  it('토글하면 보인다', () => {
    expect(
      matchesMatrixFilter(makeMatrixTask({ status: 'done' }), { ...f, showCompleted: true }, ctx)
    ).toBe(true)
    expect(
      matchesMatrixFilter(makeMatrixTask({ archived: true }), { ...f, showArchived: true }, ctx)
    ).toBe(true)
  })

  it('프로젝트로 좁힌다', () => {
    const t = makeMatrixTask({ projectId: 'proj-1' })
    expect(matchesMatrixFilter(t, { ...f, projectIds: ['proj-1'] }, ctx)).toBe(true)
    expect(matchesMatrixFilter(t, { ...f, projectIds: ['proj-2'] }, ctx)).toBe(false)
  })

  it('텍스트는 제목·태그·담당자·프로젝트명을 훑는다', () => {
    const t = makeMatrixTask({ title: '기획서 검토', tags: ['launch'], assignees: ['alice'] })
    for (const q of ['기획', '검토', 'launch', 'ALICE', '데모']) {
      expect(matchesMatrixFilter(t, { ...f, text: q }, ctx)).toBe(true)
    }
    expect(matchesMatrixFilter(t, { ...f, text: '없는말' }, ctx)).toBe(false)
  })

  it('태그·담당자 필터는 OR', () => {
    const t = makeMatrixTask({ tags: ['a', 'b'], assignees: ['alice'] })
    expect(matchesMatrixFilter(t, { ...f, tags: ['b', 'z'] }, ctx)).toBe(true)
    expect(matchesMatrixFilter(t, { ...f, tags: ['z'] }, ctx)).toBe(false)
    expect(matchesMatrixFilter(t, { ...f, assignees: ['alice'] }, ctx)).toBe(true)
  })

  it("subtaskMode 'hide' 는 하위 작업을 감춘다", () => {
    const sub = makeMatrixTask({ parentId: 'p1' })
    expect(matchesMatrixFilter(sub, f, { ...ctx, subtaskMode: 'hide' })).toBe(false)
    expect(matchesMatrixFilter(sub, f, ctx)).toBe(true)
  })

  it('applyMatrixFilter 는 원본을 건드리지 않는다', () => {
    const tasks = [makeMatrixTask({ id: 'a' }), makeMatrixTask({ id: 'b', status: 'done' })]
    expect(applyMatrixFilter(tasks, f, ctx)).toHaveLength(1)
    expect(tasks).toHaveLength(2)
  })
})

describe('prepareTasksForSubtaskMode', () => {
  const parent = makeMatrixTask({ id: 'p', filePath: 'p.md', parentId: null })
  const child = makeMatrixTask({ id: 'c', filePath: 'c.md', parentId: 'p' })
  const grandchild = makeMatrixTask({ id: 'g', filePath: 'g.md', parentId: 'c' })
  const orphan = makeMatrixTask({ id: 'o', filePath: 'o.md', parentId: 'missing' })

  it('rollup은 자손을 최상위 부모 카드 수로 합친다', () => {
    const result = prepareTasksForSubtaskMode([parent, child, grandchild, orphan], 'rollup', ctx.classify)
    expect(result.map((t) => t.id)).toEqual(['p', 'o'])
    expect(result[0]?.rolledUpSubtaskCount).toBe(2)
    expect(result[1]?.rolledUpSubtaskCount).toBeUndefined()
  })

  it('rollup은 하위 제목·태그·담당자를 부모 카드 검색에 포함한다', () => {
    const taggedChild = makeMatrixTask({
      id: 'c2',
      filePath: 'c2.md',
      parentId: 'p',
      title: '숨은 하위 제목',
      tags: ['child-tag'],
      assignees: ['child-owner']
    })
    const [rolled] = prepareTasksForSubtaskMode([parent, taggedChild], 'rollup', ctx.classify)
    expect(rolled).toBeDefined()
    for (const text of ['숨은', 'child-tag', 'child-owner']) {
      expect(matchesMatrixFilter(rolled!, { ...makeDefaultFilter(), text }, { ...ctx, subtaskMode: 'rollup' })).toBe(
        true
      )
    }
    expect(
      matchesMatrixFilter(
        rolled!,
        { ...makeDefaultFilter(), tags: ['child-tag'], assignees: ['child-owner'] },
        { ...ctx, subtaskMode: 'rollup' }
      )
    ).toBe(true)
  })

  it('rollup은 하위 긴급·중요·완료 상태를 개수로 집계하되 부모 필드는 유지한다', () => {
    const urgentImportant = makeMatrixTask({
      id: 'c2',
      filePath: 'c2.md',
      parentId: 'p',
      due: '2026-08-08',
      priority: 'critical'
    })
    const completed = makeMatrixTask({
      id: 'c3',
      filePath: 'c3.md',
      parentId: 'p',
      status: 'done',
      priority: 'low'
    })
    const [rolled] = prepareTasksForSubtaskMode(
      [parent, urgentImportant, completed],
      'rollup',
      ctx.classify
    )
    expect(rolled).toMatchObject({
      due: parent.due,
      priority: parent.priority,
      rolledUpUrgentCount: 1,
      rolledUpImportantCount: 1,
      rolledUpCompletedCount: 1
    })
  })

  it('flat은 원본 순서를 유지하고 hide는 하위 작업을 제외한다', () => {
    const tasks = [parent, child]
    expect(prepareTasksForSubtaskMode(tasks, 'flat')).toEqual(tasks)
    expect(prepareTasksForSubtaskMode(tasks, 'hide')).toEqual([parent])
    expect(prepareTasksForSubtaskMode(tasks, 'flat')).not.toBe(tasks)
  })

  it('부모 순환 참조가 있으면 작업을 숨기지 않는다', () => {
    const a = makeMatrixTask({ id: 'a', filePath: 'a.md', parentId: 'b' })
    const b = makeMatrixTask({ id: 'b', filePath: 'b.md', parentId: 'a' })
    expect(prepareTasksForSubtaskMode([a, b], 'rollup').map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('sortCards', () => {
  const cctx = makeCtx()
  const tasks: MatrixTask[] = [
    makeMatrixTask({ id: '1', title: '다', due: '2026-08-20', priority: 'low', mtime: 30 }),
    makeMatrixTask({ id: '2', title: '가', due: '', priority: 'critical', mtime: 10 }),
    makeMatrixTask({ id: '3', title: '나', due: '2026-08-01', priority: 'medium', mtime: 20 })
  ]

  it('마감일 정렬: 빠른 순, 미지정은 마지막', () => {
    expect(sortCards(tasks, 'due', cctx).map((t) => t.id)).toEqual(['3', '1', '2'])
  })

  it('우선순위 정렬: 팔레트 순서', () => {
    expect(sortCards(tasks, 'priority', cctx).map((t) => t.id)).toEqual(['2', '3', '1'])
  })

  it('제목 정렬은 한글 사전순', () => {
    expect(sortCards(tasks, 'title', cctx).map((t) => t.title)).toEqual(['가', '나', '다'])
  })

  it('수정일 정렬은 최신 우선', () => {
    expect(sortCards(tasks, 'updated', cctx).map((t) => t.id)).toEqual(['1', '3', '2'])
  })

  it('원본 배열을 변형하지 않는다', () => {
    const before = tasks.map((t) => t.id)
    sortCards(tasks, 'title', cctx)
    expect(tasks.map((t) => t.id)).toEqual(before)
  })

  it('미상 우선순위는 맨 뒤', () => {
    const withUnknown = [...tasks, makeMatrixTask({ id: '4', priority: '??' })]
    expect(sortCards(withUnknown, 'priority', cctx).map((t) => t.id).at(-1)).toBe('4')
  })
})
