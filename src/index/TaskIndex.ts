import { type App, TFile } from 'obsidian'
import { normalizeDateField } from '../model/dates'
import type { MatrixTask, ProjectMeta, QuadrantWritePlan, TaskType } from '../model/types'
import { PM_PROJECT_KEY, PM_TASK_KEY } from '../pm/pmTypes'

const TASK_TYPES: readonly TaskType[] = ['task', 'milestone', 'subtask']

/**
 * pm-task 노트의 인메모리 인덱스.
 *
 * 폴더로 범위를 제한하지 않고 vault 전체를 훑는다. `metadataCache.getFileCache()`
 * 는 디스크 I/O 없는 메모리 맵 조회라 전수 스캔이 싸고, 프론트매터 판별자가
 * 폴더 규약보다 권위 있다 (프로젝트 폴더를 옮겨도 깨지지 않는다).
 */
export class MatrixIndex {
  private tasks = new Map<string, MatrixTask>()
  private projects = new Map<string, ProjectMeta>()
  private warnedPaths = new Set<string>()

  constructor(private readonly app: App) {}

  rebuild(): void {
    this.tasks.clear()
    this.projects.clear()
    for (const file of this.app.vault.getMarkdownFiles()) {
      this.ingest(file)
    }
  }

  /** 단일 파일 증분 갱신. 인덱스가 실제로 바뀌었으면 true. */
  syncFile(path: string): boolean {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) return this.removePath(path)

    const before = this.tasks.get(path)
    const hadProject = [...this.projects.values()].some((p) => p.filePath === path)
    this.tasks.delete(path)
    this.removeProjectByPath(path)

    this.ingest(file)

    const after = this.tasks.get(path)
    const hasProject = [...this.projects.values()].some((p) => p.filePath === path)
    if (hadProject !== hasProject) return true
    if (!before && !after) return false
    if (!before || !after) return true
    return !sameTask(before, after)
  }

  removePath(path: string): boolean {
    const hadTask = this.tasks.delete(path)
    const hadProject = this.removeProjectByPath(path)
    return hadTask || hadProject
  }

  all(): MatrixTask[] {
    return [...this.tasks.values()]
  }

  get(path: string): MatrixTask | undefined {
    return this.tasks.get(path)
  }

  /**
   * processFrontMatter 직후에는 metadataCache가 아직 이전 값을 가리킬 수 있다.
   * 우리 쓰기 이벤트를 억제하는 동안에도 카드가 새 사분면에 머물도록, 적용이
   * 성공한 계획만 인덱스에 낙관적으로 반영한다.
   */
  applyPlan(plan: QuadrantWritePlan): boolean {
    const current = this.tasks.get(plan.filePath)
    if (!current || (plan.taskId && current.id !== plan.taskId)) return false

    const next = { ...current }
    for (const change of plan.changes) next[change.field] = change.after
    next.mtime = Date.now()
    this.tasks.set(plan.filePath, next)
    return true
  }

  size(): number {
    return this.tasks.size
  }

  allProjects(): ProjectMeta[] {
    return [...this.projects.values()].sort((a, b) => a.title.localeCompare(b.title))
  }

  projectTitle(projectId: string): string {
    return this.projects.get(projectId)?.title ?? ''
  }

  projectFilePath(projectId: string): string {
    return this.projects.get(projectId)?.filePath ?? ''
  }

  /** 매트릭스가 신경 쓰는 노트인지 (툴바 새로고침 판단용). */
  isRelevantFrontmatter(path: string): boolean {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) return this.tasks.has(path)
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
    return fm?.[PM_TASK_KEY] === true || fm?.[PM_PROJECT_KEY] === true || this.tasks.has(path)
  }

  private ingest(file: TFile): void {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
    if (!fm) return

    if (fm[PM_PROJECT_KEY] === true) {
      const id = str(fm['id'])
      if (id) {
        this.projects.set(id, {
          id,
          title: str(fm['title']) || file.basename,
          filePath: file.path,
          color: str(fm['color']),
          icon: str(fm['icon'])
        })
      }
      return
    }

    if (fm[PM_TASK_KEY] !== true) return
    this.tasks.set(file.path, this.toMatrixTask(fm, file))
  }

  private removeProjectByPath(path: string): boolean {
    for (const [id, p] of this.projects) {
      if (p.filePath === path) {
        this.projects.delete(id)
        return true
      }
    }
    return false
  }

  private toMatrixTask(fm: Record<string, unknown>, file: TFile): MatrixTask {
    const due = normalizeDateField(fm['due'])
    if (!due && fm['due'] !== undefined && fm['due'] !== null && fm['due'] !== '') {
      this.warnOnce(file.path, 'due')
    }

    const rawType = str(fm['type'])
    const type = (TASK_TYPES as readonly string[]).includes(rawType) ? (rawType as TaskType) : 'task'
    const parentId = str(fm['parentId'])

    return {
      id: str(fm['id']),
      filePath: file.path,
      title: str(fm['title']) || file.basename,
      type,
      status: str(fm['status']),
      priority: str(fm['priority']),
      start: normalizeDateField(fm['start']),
      due,
      progress: num(fm['progress']),
      completed: normalizeDateField(fm['completed']),
      // 배열은 반드시 복사한다. getFileCache().frontmatter 는 Obsidian 의 라이브
      // 객체라, 같은 배열을 들고 있다가 변형하면 캐시가 오염된다.
      tags: strArray(fm['tags']),
      assignees: strArray(fm['assignees']),
      projectId: str(fm['projectId']),
      parentId: parentId || null,
      archived: isArchivedPath(file.path),
      mtime: file.stat?.mtime ?? 0
    }
  }

  private warnOnce(path: string, field: string): void {
    if (this.warnedPaths.has(path)) return
    this.warnedPaths.add(path)
    console.warn(`[EIS] ${path}: '${field}' 값을 날짜로 해석하지 못해 미지정으로 처리합니다.`)
  }
}

export function isArchivedPath(path: string): boolean {
  return path.split('/').includes('Archive')
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function sameTask(a: MatrixTask, b: MatrixTask): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.type === b.type &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.start === b.start &&
    a.due === b.due &&
    a.progress === b.progress &&
    a.completed === b.completed &&
    a.projectId === b.projectId &&
    a.parentId === b.parentId &&
    a.archived === b.archived &&
    sameArray(a.tags, b.tags) &&
    sameArray(a.assignees, b.assignees)
  )
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}
