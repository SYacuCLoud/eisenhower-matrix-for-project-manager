/**
 * Project Manager 의 팔레트 타입을 구조적으로 복사한 것.
 * PM 은 npm 패키지가 아니고 공개 API 도 없으므로 import 하지 않는다.
 * PM `src/types.ts` 와 형태가 일치해야 한다.
 */

export interface StatusConfig {
  id: string
  label: string
  color: string
  icon: string
  /** true = 완료로 간주되는 상태. `id === 'done'` 비교 대신 반드시 이 플래그를 쓴다. */
  complete: boolean
}

export interface PriorityConfig {
  id: string
  label: string
  color: string
  icon: string
}

/** PM `DEFAULT_STATUSES` 복사본 — PM 미설치/설정 손상 시 폴백. */
export const FALLBACK_STATUSES: readonly StatusConfig[] = Object.freeze([
  { id: 'todo', label: 'To Do', color: '#8a94a0', icon: '', complete: false },
  { id: 'in-progress', label: 'In Progress', color: '#8b72be', icon: '', complete: false },
  { id: 'blocked', label: 'Blocked', color: '#c47070', icon: '', complete: false },
  { id: 'review', label: 'In Review', color: '#b8a06b', icon: '', complete: false },
  { id: 'done', label: 'Done', color: '#79b58d', icon: '', complete: true },
  { id: 'cancelled', label: 'Cancelled', color: '#767491', icon: '', complete: true }
])

/** PM `DEFAULT_PRIORITIES` 복사본. 배열 순서 = 순위 (index 0 이 최상위). */
export const FALLBACK_PRIORITIES: readonly PriorityConfig[] = Object.freeze([
  { id: 'critical', label: 'Critical', color: '#c47070', icon: '' },
  { id: 'high', label: 'High', color: '#b8a06b', icon: '' },
  { id: 'medium', label: 'Medium', color: '#8a94a0', icon: '' },
  { id: 'low', label: 'Low', color: '#79b58d', icon: '' }
])

export const PM_PLUGIN_ID = 'project-manager'
export const PM_TASK_KEY = 'pm-task'
export const PM_PROJECT_KEY = 'pm-project'
