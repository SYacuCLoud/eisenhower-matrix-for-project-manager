import { describe, expect, it } from 'vitest'
import { priorityColor, priorityLabel, readPmPalettes, statusLabel } from '../src/pm/bridge'
import { FALLBACK_PRIORITIES } from '../src/pm/pmTypes'
import { asApp, FakeApp } from './fakeApp'

const PM_SETTINGS = {
  projectsFolder: '업무',
  statuses: [
    { id: 'todo', label: '할 일', color: '#111', icon: '', complete: false },
    { id: 'ship', label: '배포됨', color: '#222', icon: '', complete: true }
  ],
  priorities: [
    { id: 'p0', label: '최우선', color: '#333', icon: '' },
    { id: 'p1', label: '보통', color: '#444', icon: '' }
  ]
}

describe('readPmPalettes', () => {
  it('PM 이 없으면 폴백', () => {
    const app = new FakeApp()
    const r = readPmPalettes(asApp(app))
    expect(r.available).toBe(false)
    expect(r.source).toBe('fallback')
    expect(r.priorities.map((p) => p.id)).toEqual(['critical', 'high', 'medium', 'low'])
    expect(r.projectsFolder).toBe('Projects')
  })

  it('PM 은 있는데 settings 가 없으면 폴백', () => {
    const app = new FakeApp()
    app.setPmPlugin({})
    expect(readPmPalettes(asApp(app)).source).toBe('fallback')
  })

  it('정상 설정을 읽는다', () => {
    const app = new FakeApp()
    app.setPmPlugin({ settings: PM_SETTINGS })
    const r = readPmPalettes(asApp(app))
    expect(r.available).toBe(true)
    expect(r.source).toBe('pm')
    expect(r.projectsFolder).toBe('업무')
    expect(r.statuses.map((s) => s.id)).toEqual(['todo', 'ship'])
    expect(r.statuses[1]!.complete).toBe(true)
    expect(r.priorities.map((p) => p.label)).toEqual(['최우선', '보통'])
  })

  it('반환값은 복사본이라 PM 설정을 오염시키지 않는다', () => {
    const app = new FakeApp()
    const settings = JSON.parse(JSON.stringify(PM_SETTINGS))
    app.setPmPlugin({ settings })
    const r = readPmPalettes(asApp(app))
    r.statuses[0]!.label = '변조됨'
    r.priorities.pop()
    expect(settings.statuses[0].label).toBe('할 일')
    expect(settings.priorities).toHaveLength(2)
  })

  it('statuses 가 빈 배열이면 폴백', () => {
    const app = new FakeApp()
    app.setPmPlugin({ settings: { ...PM_SETTINGS, statuses: [] } })
    const r = readPmPalettes(asApp(app))
    expect(r.source).toBe('fallback')
    expect(r.available).toBe(true)
  })

  it('complete 플래그가 없는 구버전 설정이면 폴백', () => {
    const app = new FakeApp()
    app.setPmPlugin({
      settings: { ...PM_SETTINGS, statuses: [{ id: 'todo', label: '할 일', color: '', icon: '' }] }
    })
    expect(readPmPalettes(asApp(app)).source).toBe('fallback')
  })

  it('priorities 가 배열이 아니면 폴백', () => {
    const app = new FakeApp()
    app.setPmPlugin({ settings: { ...PM_SETTINGS, priorities: 'nope' } })
    expect(readPmPalettes(asApp(app)).source).toBe('fallback')
  })

  it('projectsFolder 가 없으면 Projects', () => {
    const app = new FakeApp()
    app.setPmPlugin({ settings: { ...PM_SETTINGS, projectsFolder: '' } })
    expect(readPmPalettes(asApp(app)).projectsFolder).toBe('Projects')
  })

  it('getPlugin 이 던져도 죽지 않는다', () => {
    const app = new FakeApp()
    app.plugins = {
      getPlugin: () => {
        throw new Error('boom')
      }
    }
    expect(readPmPalettes(asApp(app)).source).toBe('fallback')
  })
})

describe('priorityLabel / priorityColor', () => {
  it('없는 id 는 id 자체를 낸다', () => {
    expect(priorityLabel('high', FALLBACK_PRIORITIES)).toBe('High')
    expect(priorityLabel('nope', FALLBACK_PRIORITIES)).toBe('nope')
    expect(priorityColor('nope', FALLBACK_PRIORITIES)).toBe('')
  })

  it('상태 label을 찾고 없으면 id를 반환한다', () => {
    expect(statusLabel('todo', PM_SETTINGS.statuses)).toBe('할 일')
    expect(statusLabel('missing', PM_SETTINGS.statuses)).toBe('missing')
  })
})
