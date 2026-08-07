import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bindTouchLongPress,
  isCardActivationKey,
  LONG_PRESS_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  movedBeyondLongPressTolerance
} from '../src/views/cardInteractions'

afterEach(() => vi.useRealTimers())

function pointerEvent(type: string, props: Partial<PointerEvent> = {}): Event {
  return Object.assign(new Event(type), {
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: 10,
    clientY: 20,
    ...props
  })
}

describe('카드 키보드 동작', () => {
  it('Enter와 Space만 기본 열기 동작으로 취급한다', () => {
    expect(isCardActivationKey('Enter')).toBe(true)
    expect(isCardActivationKey(' ')).toBe(true)
    expect(isCardActivationKey('Spacebar')).toBe(false)
    expect(isCardActivationKey('ArrowDown')).toBe(false)
  })
})

describe('모바일 길게 누르기 이동 허용 범위', () => {
  it('허용 거리 이내 움직임은 길게 누르기를 유지한다', () => {
    expect(movedBeyondLongPressTolerance(10, 10, 16, 16)).toBe(false)
  })

  it('허용 거리를 넘으면 스크롤 제스처로 보고 취소한다', () => {
    expect(
      movedBeyondLongPressTolerance(0, 0, LONG_PRESS_MOVE_TOLERANCE_PX + 1, 0)
    ).toBe(true)
  })

  it('550ms 동안 터치를 유지하면 한 번 실행한다', () => {
    vi.useFakeTimers()
    const target = new EventTarget()
    const callback = vi.fn()
    const dispose = bindTouchLongPress(target, callback)
    target.dispatchEvent(pointerEvent('pointerdown'))
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledWith({ x: 10, y: 20 })
    expect(callback).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('길게 누르는 동안 스크롤 거리만큼 움직이면 취소한다', () => {
    vi.useFakeTimers()
    const target = new EventTarget()
    const callback = vi.fn()
    bindTouchLongPress(target, callback)
    target.dispatchEvent(pointerEvent('pointerdown'))
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(callback).not.toHaveBeenCalled()
  })
})
