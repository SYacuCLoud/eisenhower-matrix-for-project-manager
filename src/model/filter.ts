import { isImportant, isTerminal, isUrgent } from './classify'
import type { ClassifyContext, MatrixFilter, MatrixTask, SubtaskMode } from './types'

export function makeDefaultFilter(): MatrixFilter {
  return {
    text: '',
    projectIds: [],
    showCompleted: false,
    showArchived: false,
    tags: [],
    assignees: []
  }
}

export function isDefaultFilter(f: MatrixFilter): boolean {
  return (
    f.text === '' &&
    f.projectIds.length === 0 &&
    !f.showCompleted &&
    !f.showArchived &&
    f.tags.length === 0 &&
    f.assignees.length === 0
  )
}

export interface FilterContext {
  classify: ClassifyContext
  subtaskMode: SubtaskMode
  /** projectId → 프로젝트 제목. 텍스트 검색 대상에 포함된다. */
  projectTitle: (projectId: string) => string
}

export function matchesMatrixFilter(t: MatrixTask, f: MatrixFilter, ctx: FilterContext): boolean {
  if (!f.showArchived && t.archived) return false
  if (!f.showCompleted && isTerminal(t.status, ctx.classify.statuses)) return false
  if (ctx.subtaskMode === 'hide' && t.parentId) return false

  if (f.projectIds.length > 0 && !f.projectIds.includes(t.projectId)) return false

  const searchableTags = [...t.tags, ...(t.rolledUpTags ?? [])]
  const searchableAssignees = [...t.assignees, ...(t.rolledUpAssignees ?? [])]
  if (f.tags.length > 0 && !f.tags.some((tag) => searchableTags.includes(tag))) return false
  if (f.assignees.length > 0 && !f.assignees.some((a) => searchableAssignees.includes(a))) return false

  const text = f.text.trim().toLocaleLowerCase()
  if (text) {
    const haystack = [
      t.title,
      ctx.projectTitle(t.projectId),
      ...t.tags,
      ...t.assignees,
      t.rolledUpSearchText ?? ''
    ]
      .join(' ')
      .toLocaleLowerCase()
    if (!haystack.includes(text)) return false
  }

  return true
}

export function applyMatrixFilter(
  tasks: readonly MatrixTask[],
  f: MatrixFilter,
  ctx: FilterContext
): MatrixTask[] {
  return tasks.filter((t) => matchesMatrixFilter(t, f, ctx))
}

/**
 * rollup 모드에서는 부모가 인덱스에 있는 하위 작업을 최상위 조상 카드에 합친다.
 * 분면과 이동 대상은 부모 작업의 날짜·우선순위를 유지한다. 하위 작업의 긴급·중요·
 * 완료 상태는 정보 배지로 집계하고 제목·태그·담당자는 부모 카드 검색에 포함한다.
 * 부모가 없는 고아 작업은 조용히 숨기지 않고 개별 카드로 남긴다.
 */
export function prepareTasksForSubtaskMode(
  tasks: readonly MatrixTask[],
  mode: SubtaskMode,
  ctx?: ClassifyContext
): MatrixTask[] {
  if (mode === 'hide') return tasks.filter((task) => !task.parentId)
  if (mode !== 'rollup') return [...tasks]

  const byId = new Map<string, MatrixTask>()
  for (const task of tasks) {
    if (task.id && !byId.has(task.id)) byId.set(task.id, task)
  }

  const groups = new Map<string, MatrixTask[]>()
  const rolledPaths = new Set<string>()
  for (const task of tasks) {
    if (!task.parentId) continue
    const root = findRollupRoot(task, byId)
    if (!root) continue
    rolledPaths.add(task.filePath)
    const members = groups.get(root.filePath) ?? []
    members.push(task)
    groups.set(root.filePath, members)
  }

  return tasks
    .filter((task) => !rolledPaths.has(task.filePath))
    .map((task) => {
      const members = groups.get(task.filePath)
      if (!members?.length) return task
      const tags = unique(members.flatMap((member) => member.tags))
      const assignees = unique(members.flatMap((member) => member.assignees))
      return {
        ...task,
        rolledUpSubtaskCount: members.length,
        rolledUpSearchText: members
          .flatMap((member) => [member.title, ...member.tags, ...member.assignees])
          .join(' '),
        rolledUpTags: tags,
        rolledUpAssignees: assignees,
        rolledUpUrgentCount: ctx ? members.filter((member) => isUrgent(member, ctx)).length : 0,
        rolledUpImportantCount: ctx
          ? members.filter((member) => isImportant(member, ctx)).length
          : 0,
        rolledUpCompletedCount: ctx
          ? members.filter((member) => isTerminal(member.status, ctx.statuses)).length
          : 0
      }
    })
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function findRollupRoot(task: MatrixTask, byId: ReadonlyMap<string, MatrixTask>): MatrixTask | null {
  let parentId = task.parentId
  let root: MatrixTask | null = null
  const seen = new Set<string>(task.id ? [task.id] : [])

  while (parentId) {
    if (seen.has(parentId)) return null
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) return root
    root = parent
    parentId = parent.parentId
  }
  return root
}
