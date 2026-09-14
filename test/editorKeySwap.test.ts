import { describe, expect, it } from 'vitest'
import { decideKeySwap, type KeyFacts } from '../src/pm/editorKeySwap'
import { pmSaveModifier } from '../src/pm/taskEditorBridge'

const base: KeyFacts = {
  kind: 'plain',
  isComposing: false,
  focused: true,
  inMultilineField: true,
  canSave: true
}

describe('decideKeySwap', () => {
  it('맨 Enter 는 제목·설명칸 어디서든 저장', () => {
    expect(decideKeySwap(base)).toBe('save')
    expect(decideKeySwap({ ...base, inMultilineField: false })).toBe('save')
  })

  it('저장 수정키+Enter 는 설명칸에서만 줄바꿈, 제목칸은 dotpm 저장에 맡긴다', () => {
    expect(decideKeySwap({ ...base, kind: 'modifier' })).toBe('newline')
    expect(decideKeySwap({ ...base, kind: 'modifier', inMultilineField: false })).toBe('delegate')
  })

  it('IME 조합 중인 Enter 는 브라우저 기본 동작(조합 확정)에 맡긴다', () => {
    expect(decideKeySwap({ ...base, isComposing: true })).toBe('native')
    expect(decideKeySwap({ ...base, kind: 'modifier', isComposing: true })).toBe('native')
  })

  it('저장 버튼이 없으면 dotpm 기본 동작으로 넘긴다', () => {
    expect(decideKeySwap({ ...base, canSave: false })).toBe('delegate')
  })

  it('textarea 가 사라졌거나 포커스를 잃었으면 무조건 부모 Scope 로 넘긴다', () => {
    expect(decideKeySwap({ ...base, focused: false })).toBe('delegate')
    expect(decideKeySwap({ ...base, kind: 'modifier', focused: false })).toBe('delegate')
    expect(decideKeySwap({ ...base, focused: false, isComposing: true })).toBe('delegate')
  })
})

describe('pmSaveModifier', () => {
  it('dotpm 설정을 읽고 없으면 Shift', () => {
    expect(pmSaveModifier({ settings: { editorSaveModifier: 'Mod' } })).toBe('Mod')
    expect(pmSaveModifier({ settings: { editorSaveModifier: 'Shift' } })).toBe('Shift')
    expect(pmSaveModifier({ settings: {} })).toBe('Shift')
    expect(pmSaveModifier(null)).toBe('Shift')
  })
})
