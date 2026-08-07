import type { Plugin, TAbstractFile } from 'obsidian'
import type { MatrixIndex } from './TaskIndex'

/** PM 의 RELOAD_DEBOUNCE_MS 와 동일. */
const DEBOUNCE_MS = 300
/** 메타데이터 이벤트가 오지 않았을 때 표식이 영구히 남지 않게 하는 만료 시간. */
const SELF_WRITE_TTL_MS = 1500

/**
 * 우리 자신이 쓴 파일의 경로. 드래그 직후 재렌더가 카드를 뽑아가지 않도록
 * 이벤트를 억제한다. PM 의 markSelfWrite / peekSelfWrite 와 같은 패턴.
 */
const selfWrites = new Map<string, number>()

export function markSelfWrite(path: string): void {
  const now = Date.now()
  if (selfWrites.size > 128) {
    for (const [p, t] of selfWrites) {
      if (now - t > SELF_WRITE_TTL_MS) selfWrites.delete(p)
    }
  }
  selfWrites.set(path, now)
}

/** 자기 쓰기에서 발생한 첫 이벤트만 소비한다. 이후 이벤트는 정상 동기화한다. */
export function consumeSelfWrite(path: string): boolean {
  const t = selfWrites.get(path)
  if (t === undefined) return false
  if (Date.now() - t > SELF_WRITE_TTL_MS) {
    selfWrites.delete(path)
    return false
  }
  selfWrites.delete(path)
  return true
}

export function clearSelfWrite(path: string): void {
  selfWrites.delete(path)
}

/**
 * vault / metadataCache 이벤트를 인덱스에 연결한다.
 *
 * `vault.on('modify')` 가 아니라 `metadataCache.on('changed')` 를 쓰는 게 핵심이다.
 * modify 는 캐시 재파싱 전에 발생해서 프론트매터가 한 박자 늦게 읽힌다.
 */
export function registerIndexSync(plugin: Plugin, index: MatrixIndex, onChange: () => void): void {
  const pending = new Set<string>()
  let timer: number | null = null
  let fullRebuild = false

  const flush = () => {
    timer = null
    let changed = false
    if (fullRebuild) {
      fullRebuild = false
      pending.clear()
      index.rebuild()
      changed = true
    } else {
      for (const path of pending) {
        if (index.syncFile(path)) changed = true
      }
      pending.clear()
    }
    if (changed) onChange()
  }

  const arm = () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(flush, DEBOUNCE_MS)
  }

  /** 우리가 방금 쓴 파일이면 무시한다. */
  const schedule = (path: string) => {
    if (consumeSelfWrite(path)) return
    pending.add(path)
    arm()
  }

  /** 삭제·이름변경처럼 self-write 여부와 무관하게 반영해야 하는 경우. */
  const scheduleForce = (path: string) => {
    pending.add(path)
    arm()
  }

  const scheduleFull = () => {
    fullRebuild = true
    arm()
  }

  plugin.register(() => {
    if (timer !== null) window.clearTimeout(timer)
    selfWrites.clear()
  })

  plugin.registerEvent(
    plugin.app.metadataCache.on('changed', (file) => {
      schedule(file.path)
    })
  )

  // 콜드 스타트 직후에는 캐시가 비어 있을 수 있다. 이 이벤트가 없으면
  // 매트릭스가 빈 채로 열린다.
  plugin.registerEvent(
    plugin.app.metadataCache.on('resolved', () => {
      scheduleFull()
    })
  )

  plugin.registerEvent(
    plugin.app.vault.on('delete', (file: TAbstractFile) => {
      scheduleForce(file.path)
    })
  )

  plugin.registerEvent(
    plugin.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
      index.removePath(oldPath)
      scheduleForce(file.path)
    })
  )
}
