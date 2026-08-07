import { describe, expect, it } from 'vitest'
import { addDays, diffDays, formatDueKo, normalizeDateField, parseDate, relativeDueKo } from '../src/model/dates'

describe('parseDate', () => {
  it('정상 날짜를 파싱한다', () => {
    expect(parseDate('2026-08-07')).toBe(Date.UTC(2026, 7, 7))
  })

  it('형식이 틀리면 null', () => {
    for (const s of ['', '2026-8-7', '20260807', 'tomorrow', '2026-08-07T00:00:00Z']) {
      expect(parseDate(s)).toBeNull()
    }
  })

  it('존재하지 않는 날짜는 null', () => {
    expect(parseDate('2026-02-31')).toBeNull()
    expect(parseDate('2026-13-01')).toBeNull()
    expect(parseDate('2026-00-10')).toBeNull()
  })

  it('윤년 2월 29일은 통과', () => {
    expect(parseDate('2028-02-29')).not.toBeNull()
    expect(parseDate('2026-02-29')).toBeNull()
  })
})

describe('normalizeDateField', () => {
  it('문자열/Date/쓰레기 값을 처리한다', () => {
    expect(normalizeDateField('2026-08-07')).toBe('2026-08-07')
    expect(normalizeDateField('  2026-08-07  ')).toBe('2026-08-07')
    expect(normalizeDateField(new Date(Date.UTC(2026, 7, 7)))).toBe('2026-08-07')
    expect(normalizeDateField('2026-08-07T09:30:00Z')).toBe('2026-08-07')
    expect(normalizeDateField('2026-13-40')).toBe('')
    expect(normalizeDateField('')).toBe('')
    expect(normalizeDateField(null)).toBe('')
    expect(normalizeDateField(undefined)).toBe('')
    expect(normalizeDateField(12345)).toBe('')
    expect(normalizeDateField(new Date(NaN))).toBe('')
  })
})

describe('diffDays / addDays', () => {
  it('월·연 경계를 넘는다', () => {
    expect(diffDays('2026-08-30', '2026-09-02')).toBe(3)
    expect(diffDays('2026-12-30', '2027-01-02')).toBe(3)
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('역방향은 음수', () => {
    expect(diffDays('2026-08-07', '2026-08-04')).toBe(-3)
  })

  it('잘못된 입력은 null / 빈 문자열', () => {
    expect(diffDays('', '2026-08-07')).toBeNull()
    expect(addDays('nope', 1)).toBe('')
  })
})

describe('relativeDueKo', () => {
  const today = '2026-08-07'

  it('지남/오늘/내일/주내/그 이후', () => {
    expect(relativeDueKo('2026-08-04', today)).toEqual({ text: '3일 지남', tone: 'overdue' })
    expect(relativeDueKo('2026-08-07', today)).toEqual({ text: '오늘', tone: 'today' })
    expect(relativeDueKo('2026-08-08', today)).toEqual({ text: '내일', tone: 'soon' })
    expect(relativeDueKo('2026-08-13', today)).toEqual({ text: '6일 뒤', tone: 'soon' })
    expect(relativeDueKo('2026-09-06', today)).toEqual({ text: '30일 뒤', tone: 'later' })
    expect(relativeDueKo('', today)).toEqual({ text: '', tone: 'none' })
  })

  it('formatDueKo 는 날짜와 상대 표현을 함께 낸다', () => {
    expect(formatDueKo('2026-08-08', today)).toBe('2026-08-08 (내일)')
    expect(formatDueKo('', today)).toBe('')
  })
})
