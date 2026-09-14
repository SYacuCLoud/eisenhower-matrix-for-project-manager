import { Scope, type App, type KeymapContext, type Plugin } from 'obsidian'
import { pmSaveModifier, type PmSaveModifier } from './taskEditorBridge'
import { PM_PLUGIN_ID } from './pmTypes'

/**
 * dotpm 편집기의 Enter 와 저장 단축키(기본 Shift+Enter)를 서로 바꾼다.
 *
 * dotpm 은 저장을 편집기(모달·탭 뷰)의 Obsidian `Scope` 에 `[수정키]+Enter` 로 등록한다.
 * Obsidian 키맵은 앱 시작 시 `window` 캡처 단계에 붙어 어떤 플러그인 DOM 리스너보다
 * 먼저 실행되므로, DOM 이벤트로는 dotpm 저장을 앞설 수 없다. 대신 편집기의 제목·설명
 * textarea 에 포커스가 있는 동안만 현재 최상위 Scope 를 부모로 하는 우리 Scope 를
 * 키맵 스택 위에 올려,
 *  - 맨 Enter            → 편집기 푸터의 저장(CTA) 버튼 클릭
 *  - 수정키+Enter(설명칸) → 줄바꿈 직접 삽입 (제목칸은 dotpm 저장 그대로)
 * 하고, 그 외 키는 전부 부모 Scope(dotpm 편집기 → 앱)로 넘긴다. dotpm 코드·설정은
 * 건드리지 않는다.
 */

export type KeySwapAction = 'save' | 'newline' | 'native' | 'delegate'

/** Scope 핸들러가 결정에 쓰는 사실 (DOM 없이 테스트하기 위해). */
export interface KeyFacts {
  /** 맨 Enter 인가(`plain`), dotpm 저장 수정키+Enter 인가(`modifier`). */
  kind: 'plain' | 'modifier'
  /** IME 조합 중이면 Enter 는 조합 확정이다. 브라우저 기본 동작에 맡긴다. */
  isComposing: boolean
  /** 우리가 Scope 를 올린 textarea 가 여전히 문서에 있고 포커스를 갖는가. */
  focused: boolean
  /** 설명 textarea 인가 (제목 textarea 는 한 줄). */
  inMultilineField: boolean
  /** 편집기 푸터의 저장 버튼을 찾았고 눌 수 있는가. */
  canSave: boolean
}

export function decideKeySwap(facts: KeyFacts): KeySwapAction {
  if (!facts.focused) return 'delegate'
  if (facts.isComposing) return 'native'
  if (facts.kind === 'plain') return facts.canSave ? 'save' : 'delegate'
  return facts.inMultilineField ? 'newline' : 'delegate'
}

/** dotpm 작업·프로젝트 편집기 본문. 모달(.pm-modal--task)과 탭(pm-task 뷰) 모두 이 구조를 쓴다. */
const EDITOR_BODY = '.pm-te-body'
const EDITOR_FOOTER = '.pm-te-footer'
const SAVE_BUTTON = `${EDITOR_FOOTER} button.mod-cta`
const TITLE_FIELD = 'textarea.pm-te-title'
const MULTILINE_FIELD = 'textarea.pm-modal-description'

interface ScopeInternals {
  handleKey?: (evt: KeyboardEvent, ctx: KeymapContext) => unknown
}

interface KeymapInternals {
  getWindowStack?: (win: Window) => { scope?: Scope } | undefined
}

/** 편집기의 제목·설명 textarea 면 돌려준다. 다른 입력칸(태그·날짜 등)은 Enter 의미가 달라 건드리지 않는다. */
function editorTextarea(el: EventTarget | null): HTMLTextAreaElement | null {
  if (!(el instanceof HTMLTextAreaElement)) return null
  if (!el.matches(TITLE_FIELD) && !el.matches(MULTILINE_FIELD)) return null
  const root = el.closest<HTMLElement>(EDITOR_BODY)?.parentElement
  if (!root || !root.querySelector(EDITOR_FOOTER)) return null
  return el
}

/** 현재 창의 최상위 Scope. 비공개 API 라 없으면 null — 기능을 조용히 끈다. */
function currentScope(app: App, win: Window): Scope | null {
  const keymap = app.keymap as unknown as KeymapInternals
  if (typeof keymap.getWindowStack !== 'function') return null
  return keymap.getWindowStack(win)?.scope ?? null
}

function delegateTo(parent: Scope, evt: KeyboardEvent, ctx: KeymapContext): unknown {
  const handleKey = (parent as unknown as ScopeInternals).handleKey
  return typeof handleKey === 'function' ? handleKey.call(parent, evt, ctx) : undefined
}

interface ActiveSwap {
  scope: Scope
  textarea: HTMLTextAreaElement
  observer: MutationObserver | null
}

export function registerEditorKeySwap(plugin: Plugin, isEnabled: () => boolean): void {
  let active: ActiveSwap | null = null
  let warned = false

  const release = (): void => {
    if (!active) return
    active.observer?.disconnect()
    plugin.app.keymap.popScope(active.scope)
    active = null
  }

  const acquire = (textarea: HTMLTextAreaElement): void => {
    if (active?.textarea === textarea) return
    release()
    const win = textarea.ownerDocument.defaultView ?? window
    const parent = currentScope(plugin.app, win)
    if (!parent) {
      if (!warned) {
        warned = true
        console.warn('[EIS] Obsidian 키맵 스택을 읽을 수 없어 dotpm 편집기 Enter 저장 옵션을 건너뜁니다.')
      }
      return
    }
    const modifier = pmSaveModifier(plugin.app.plugins?.getPlugin?.(PM_PLUGIN_ID))
    const scope = buildScope(parent, textarea, modifier)
    plugin.app.keymap.pushScope(scope)

    // 모달이 닫혀 textarea 가 사라질 때는 focusout 이 오지 않는다. 문서 변화로 정리한다.
    let observer: MutationObserver | null = null
    const MutationObserverCtor = win.MutationObserver
    if (MutationObserverCtor && textarea.ownerDocument.body) {
      observer = new MutationObserverCtor(() => {
        if (!textarea.isConnected) release()
      })
      observer.observe(textarea.ownerDocument.body, { childList: true, subtree: true })
    }
    active = { scope, textarea, observer }
  }

  plugin.registerDomEvent(
    window,
    'focusin',
    (event: FocusEvent) => {
      if (!isEnabled()) {
        release()
        return
      }
      const textarea = editorTextarea(event.target)
      if (textarea) acquire(textarea)
      else release()
    },
    { capture: true }
  )
  plugin.registerDomEvent(window, 'focusout', () => release(), { capture: true })
  plugin.register(release)
}

function buildScope(parent: Scope, textarea: HTMLTextAreaElement, modifier: PmSaveModifier): Scope {
  const scope = new Scope(parent)
  const facts = (kind: KeyFacts['kind'], evt: KeyboardEvent): KeyFacts => ({
    kind,
    isComposing: evt.isComposing || evt.keyCode === 229,
    focused: textarea.isConnected && textarea.ownerDocument.activeElement === textarea,
    inMultilineField: textarea.matches(MULTILINE_FIELD),
    canSave: saveButton(textarea) !== null
  })
  const run = (kind: KeyFacts['kind'], evt: KeyboardEvent, ctx: KeymapContext): unknown => {
    switch (decideKeySwap(facts(kind, evt))) {
      case 'save':
        saveButton(textarea)?.click()
        return false
      case 'newline':
        insertNewline(textarea)
        return false
      case 'native':
        return undefined
      default:
        return delegateTo(parent, evt, ctx)
    }
  }
  scope.register([], 'Enter', (evt, ctx) => run('plain', evt, ctx))
  scope.register([modifier], 'Enter', (evt, ctx) => run('modifier', evt, ctx))
  return scope
}

function saveButton(textarea: HTMLTextAreaElement): HTMLButtonElement | null {
  const root = textarea.closest<HTMLElement>(EDITOR_BODY)?.parentElement
  const button = root?.querySelector<HTMLButtonElement>(SAVE_BUTTON) ?? null
  return button && !button.disabled ? button : null
}

function insertNewline(textarea: HTMLTextAreaElement): void {
  textarea.setRangeText('\n', textarea.selectionStart, textarea.selectionEnd, 'end')
  // dotpm 은 input 이벤트로 초안(task.description)을 갱신한다.
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}
