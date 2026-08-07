import type { App } from 'obsidian'
import {
  FALLBACK_PRIORITIES,
  FALLBACK_STATUSES,
  PM_PLUGIN_ID,
  type PriorityConfig,
  type StatusConfig
} from './pmTypes'

export interface PmPalettes {
  /** PM 이 설치되어 있고 설정을 읽을 수 있었는가 */
  available: boolean
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  projectsFolder: string
  source: 'pm' | 'fallback'
}

let warned = false

/**
 * PM 의 팔레트를 읽는다. PM 은 공개 API 도, 설정 변경 이벤트도 없으므로
 *  - 전 구간 옵셔널 체이닝 + 타입 가드로 방어하고
 *  - 캐싱하지 않는다 (맵 조회 1회 수준이고, 캐시는 즉시 낡는다).
 */
export function readPmPalettes(app: App): PmPalettes {
  const plugin = safeGetPlugin(app, PM_PLUGIN_ID)
  const settings = (plugin as { settings?: unknown } | null)?.settings as
    | Record<string, unknown>
    | undefined

  if (!settings) {
    return fallback(false)
  }

  const statuses = isStatusArray(settings['statuses']) ? settings['statuses'].map(copyStatus) : null
  const priorities = isPriorityArray(settings['priorities'])
    ? settings['priorities'].map(copyPriority)
    : null

  if (!statuses || !priorities) {
    if (!warned) {
      warned = true
      console.warn('[EIS] Project Manager 설정 형태를 인식하지 못해 기본 팔레트를 사용합니다.')
    }
    return fallback(true)
  }

  const folder = settings['projectsFolder']
  return {
    available: true,
    statuses,
    priorities,
    projectsFolder: typeof folder === 'string' && folder ? folder : 'Projects',
    source: 'pm'
  }
}

function fallback(pmPresent: boolean): PmPalettes {
  return {
    available: pmPresent,
    statuses: FALLBACK_STATUSES.map(copyStatus),
    priorities: FALLBACK_PRIORITIES.map(copyPriority),
    projectsFolder: 'Projects',
    source: 'fallback'
  }
}

function safeGetPlugin(app: App, id: string): unknown {
  try {
    const registry = app.plugins
    const plugin = registry?.getPlugin?.(id)
    return plugin && typeof plugin === 'object' ? plugin : null
  } catch {
    return null
  }
}

/** `complete` 가 boolean 이 아니면 배열 전체를 거부한다 — 구버전 data.json 방어. */
function isStatusArray(v: unknown): v is StatusConfig[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (x) =>
        x !== null &&
        typeof x === 'object' &&
        typeof (x as StatusConfig).id === 'string' &&
        (x as StatusConfig).id.length > 0 &&
        typeof (x as StatusConfig).complete === 'boolean'
    )
  )
}

function isPriorityArray(v: unknown): v is PriorityConfig[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (x) =>
        x !== null &&
        typeof x === 'object' &&
        typeof (x as PriorityConfig).id === 'string' &&
        (x as PriorityConfig).id.length > 0
    )
  )
}

/** PM 의 라이브 객체를 절대 공유하지 않는다. */
function copyStatus(s: StatusConfig): StatusConfig {
  return {
    id: s.id,
    label: typeof s.label === 'string' ? s.label : s.id,
    color: typeof s.color === 'string' ? s.color : '',
    icon: typeof s.icon === 'string' ? s.icon : '',
    complete: s.complete === true
  }
}

function copyPriority(p: PriorityConfig): PriorityConfig {
  return {
    id: p.id,
    label: typeof p.label === 'string' ? p.label : p.id,
    color: typeof p.color === 'string' ? p.color : '',
    icon: typeof p.icon === 'string' ? p.icon : ''
  }
}

export function priorityLabel(id: string, priorities: readonly PriorityConfig[]): string {
  return priorities.find((p) => p.id === id)?.label ?? id
}

export function priorityColor(id: string, priorities: readonly PriorityConfig[]): string {
  return priorities.find((p) => p.id === id)?.color ?? ''
}
