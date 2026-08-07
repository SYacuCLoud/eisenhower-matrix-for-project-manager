/**
 * 'YYYY-MM-DD' 문자열 위에서만 도는 날짜 산술.
 *
 * 모든 계산은 UTC 자정 기준이라 DST/타임존 영향이 없다. Temporal 폴리필을 쓰지
 * 않는 이유: 필요한 연산이 '파싱 / 일수 차 / 일수 더하기' 셋뿐이고, UTC epoch
 * 기준이면 이 셋은 정확하다.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

/** 로컬 기준 오늘을 'YYYY-MM-DD' 로. */
export function todayString(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 'YYYY-MM-DD' → UTC epoch ms. 형식/값이 잘못되면 null. */
export function parseDate(s: string): number | null {
  if (!ISO_DATE.test(s)) return null
  const year = Number(s.slice(0, 4))
  const month = Number(s.slice(5, 7))
  const day = Number(s.slice(8, 10))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const ms = Date.UTC(year, month - 1, day)
  const back = new Date(ms)
  // 2026-02-31 같은 존재하지 않는 날짜를 걸러낸다.
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null
  }
  return ms
}

export function isValidDate(s: string): boolean {
  return parseDate(s) !== null
}

/**
 * 프론트매터 값에서 날짜 필드를 뽑는다.
 * Obsidian 의 YAML 파서는 따옴표 없는 `2026-08-07` 을 Date 객체로 넘기기도 한다.
 * 해석할 수 없으면 '' (미지정) 을 반환한다 — 절대 throw 하지 않는다.
 */
export function normalizeDateField(v: unknown): string {
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return ''
    if (ISO_DATE.test(t)) return isValidDate(t) ? t : ''
    // '2026-08-07T09:00:00Z' 처럼 시각이 붙은 경우 날짜부만 취한다.
    const head = t.slice(0, 10)
    return ISO_DATE.test(head) && isValidDate(head) ? head : ''
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  return ''
}

/** to - from, 일 단위. 둘 중 하나라도 잘못되면 null. */
export function diffDays(from: string, to: string): number | null {
  const a = parseDate(from)
  const b = parseDate(to)
  if (a === null || b === null) return null
  return Math.round((b - a) / MS_PER_DAY)
}

/** 'YYYY-MM-DD' 에 n 일을 더한 'YYYY-MM-DD'. 입력이 잘못되면 ''. */
export function addDays(base: string, n: number): string {
  const ms = parseDate(base)
  if (ms === null) return ''
  return new Date(ms + n * MS_PER_DAY).toISOString().slice(0, 10)
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'none'

export interface RelativeDue {
  text: string
  tone: DueTone
}

/** 카드/모달에 쓸 한국어 상대 표현. */
export function relativeDueKo(due: string, today: string): RelativeDue {
  const days = diffDays(today, due)
  if (days === null) return { text: '', tone: 'none' }
  if (days < 0) return { text: `${-days}일 지남`, tone: 'overdue' }
  if (days === 0) return { text: '오늘', tone: 'today' }
  if (days === 1) return { text: '내일', tone: 'soon' }
  if (days <= 7) return { text: `${days}일 뒤`, tone: 'soon' }
  return { text: `${days}일 뒤`, tone: 'later' }
}

/** '2026-08-08 (내일)' 형태. 값이 없으면 ''. */
export function formatDueKo(due: string, today: string): string {
  if (!due) return ''
  const rel = relativeDueKo(due, today)
  return rel.text ? `${due} (${rel.text})` : due
}
