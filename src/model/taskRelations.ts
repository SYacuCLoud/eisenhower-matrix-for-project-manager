import type { MatrixTask } from './types'

/** PM이 부모 작업과 함께 재귀 삭제할 작업들의 파일 경로를 계산한다. */
export function taskFamilyPaths(
  tasks: readonly MatrixTask[],
  root: MatrixTask
): Set<string> {
  const ids = new Set<string>(root.id ? [root.id] : [])
  const paths = new Set<string>([root.filePath])
  let changed = true

  while (changed) {
    changed = false
    for (const task of tasks) {
      if (task.projectId !== root.projectId || !task.parentId || !ids.has(task.parentId)) continue
      if (!paths.has(task.filePath)) {
        paths.add(task.filePath)
        changed = true
      }
      if (task.id && !ids.has(task.id)) {
        ids.add(task.id)
        changed = true
      }
    }
  }

  return paths
}
