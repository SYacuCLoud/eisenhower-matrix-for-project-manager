import { Notice } from 'obsidian'
import { KO } from './i18n/ko'

/**
 * 이벤트 핸들러용 래퍼. 처리되지 않은 rejection 이 콘솔에만 남고 사용자는
 * 아무것도 모르는 상황을 막는다. (PM `utils.ts` 의 safeAsync 와 같은 역할)
 */
export function safeAsync<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown> | unknown,
  message = KO.error.generic
): (...args: A) => void {
  return (...args: A) => {
    try {
      const result = fn(...args)
      if (result instanceof Promise) {
        result.catch((e: unknown) => {
          console.error('[EIS]', e)
          new Notice(message)
        })
      }
    } catch (e) {
      console.error('[EIS]', e)
      new Notice(message)
    }
  }
}
