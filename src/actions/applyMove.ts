import { type App, TFile } from 'obsidian'
import { clearSelfWrite, markSelfWrite } from '../index/vaultSync'
import { normalizeDateField } from '../model/dates'
import type { QuadrantWritePlan, WritableField } from '../model/types'
import { PM_TASK_KEY } from '../pm/pmTypes'

export type MoveFailureReason = 'missing' | 'not-a-task' | 'stale' | 'conflict' | 'error'

export type MoveResult = { ok: true } | { ok: false; reason: MoveFailureReason; detail?: string }

/**
 * 계획을 프론트매터에 반영한다.
 *
 * 세 가지 성질이 중요하다.
 *  1. 키 삭제 없는 **병합** — PM 이 소유한 나머지 필드가 전부 보존된다.
 *     (PM 자신은 ProjectStore.ts:606 에서 모든 키를 지우고 덮어쓰므로,
 *      우리 커스텀 키는 어차피 살아남지 못한다. 그래서 아무것도 추가하지 않는다.)
 *  2. mtime 이 아니라 **필드 값 비교**로 동시성을 검사한다. mtime 은 의미 없는
 *     저장에도 바뀐다.
 *  3. 검사에 실패하면 콜백 안에서 아무것도 변형하지 않고 빠져나온다 →
 *     Obsidian 이 파일을 쓰지 않는다.
 */
export async function applyQuadrantMove(app: App, plan: QuadrantWritePlan): Promise<MoveResult> {
  if (plan.changes.length === 0) return { ok: true }

  const file = app.vault.getAbstractFileByPath(plan.filePath)
  if (!(file instanceof TFile)) return { ok: false, reason: 'missing' }

  let failure: MoveResult | null = null

  try {
    markSelfWrite(plan.filePath)
    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      if (fm[PM_TASK_KEY] !== true) {
        failure = { ok: false, reason: 'not-a-task' }
        return
      }
      if (plan.taskId && fm['id'] !== plan.taskId) {
        failure = { ok: false, reason: 'stale' }
        return
      }
      for (const c of plan.changes) {
        if (readField(fm, c.field) !== c.before) {
          failure = { ok: false, reason: 'conflict', detail: c.field }
          return
        }
      }
      for (const c of plan.changes) {
        fm[c.field] = c.after
      }
      fm['updatedAt'] = new Date().toISOString()
    })
  } catch (e) {
    clearSelfWrite(plan.filePath)
    console.error('[EIS] 프론트매터 저장 실패', e)
    return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) }
  }

  if (failure) clearSelfWrite(plan.filePath)
  return failure ?? { ok: true }
}

/** 계획이 기록한 `before` 와 같은 규칙으로 정규화해서 비교한다. */
function readField(fm: Record<string, unknown>, field: WritableField): string {
  if (field === 'priority') {
    const v = fm['priority']
    return typeof v === 'string' ? v : ''
  }
  return normalizeDateField(fm[field])
}
