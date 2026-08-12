import { describe, expect, it } from 'vitest'
import { taskFamilyPaths } from '../src/model/taskRelations'
import { makeMatrixTask } from './fixtures'

describe('taskFamilyPaths', () => {
  it('부모와 모든 깊이의 하위 작업 경로를 반환한다', () => {
    const root = makeMatrixTask({ id: 'root', filePath: 'root.md' })
    const child = makeMatrixTask({ id: 'child', parentId: 'root', filePath: 'child.md' })
    const grandchild = makeMatrixTask({ id: 'grandchild', parentId: 'child', filePath: 'grandchild.md' })

    expect([...taskFamilyPaths([grandchild, child, root], root)]).toEqual([
      'root.md',
      'child.md',
      'grandchild.md'
    ])
  })

  it('다른 프로젝트의 같은 id 관계는 포함하지 않는다', () => {
    const root = makeMatrixTask({ id: 'root', filePath: 'root.md', projectId: 'project-a' })
    const foreign = makeMatrixTask({
      id: 'foreign',
      parentId: 'root',
      filePath: 'foreign.md',
      projectId: 'project-b'
    })

    expect([...taskFamilyPaths([root, foreign], root)]).toEqual(['root.md'])
  })
})
