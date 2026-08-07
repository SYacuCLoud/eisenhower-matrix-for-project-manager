export const LONG_PRESS_MS = 550
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10

export function isCardActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}

export function movedBeyondLongPressTolerance(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) > LONG_PRESS_MOVE_TOLERANCE_PX
}

export interface LongPressPoint {
  x: number
  y: number
}

/** 포인터 이벤트 기반이라 데스크톱의 마우스 우클릭과 모바일 터치를 분리한다. */
export function bindTouchLongPress(
  target: EventTarget,
  onLongPress: (point: LongPressPoint) => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let startX = 0
  let startY = 0

  const cancel = () => {
    if (timer !== null) globalThis.clearTimeout(timer)
    timer = null
  }
  const pointerDown = (raw: Event) => {
    const event = raw as PointerEvent
    if (event.pointerType !== 'touch' || !event.isPrimary || event.button !== 0) return
    cancel()
    startX = event.clientX
    startY = event.clientY
    timer = globalThis.setTimeout(() => {
      timer = null
      onLongPress({ x: startX, y: startY })
    }, LONG_PRESS_MS)
  }
  const pointerMove = (raw: Event) => {
    const event = raw as PointerEvent
    if (
      timer !== null &&
      movedBeyondLongPressTolerance(startX, startY, event.clientX, event.clientY)
    ) {
      cancel()
    }
  }

  target.addEventListener('pointerdown', pointerDown)
  target.addEventListener('pointermove', pointerMove)
  target.addEventListener('pointerup', cancel)
  target.addEventListener('pointercancel', cancel)
  target.addEventListener('pointerleave', cancel)

  return () => {
    cancel()
    target.removeEventListener('pointerdown', pointerDown)
    target.removeEventListener('pointermove', pointerMove)
    target.removeEventListener('pointerup', cancel)
    target.removeEventListener('pointercancel', cancel)
    target.removeEventListener('pointerleave', cancel)
  }
}
