// 테스트에서 'obsidian' 을 대체한다 (vitest.config.ts 의 alias).
// 플러그인 코드가 window.setTimeout 을 쓰므로 node 전역에 연결한다.
Object.assign(globalThis, { window: globalThis })

export class Notice {
  constructor(public message?: unknown) {}
  hide(): void {}
}

export function setIcon(): void {}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

export class TAbstractFile {
  path = ''
  name = ''
  parent: TFolder | null = null
}

export class TFile extends TAbstractFile {
  basename = ''
  extension = 'md'
  stat = { ctime: 0, mtime: 0, size: 0 }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = []
  isRoot(): boolean {
    return this.parent === null
  }
}

export class ItemView {}
export class Modal {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Menu {}
export const Platform = { isMobile: false }
