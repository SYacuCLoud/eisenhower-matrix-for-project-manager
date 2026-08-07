import { TFile } from 'obsidian'

type Fm = Record<string, unknown>

/**
 * MatrixIndex / applyQuadrantMove 가 실제로 만지는 세 개의 표면만 흉내 낸다:
 * vault, metadataCache, fileManager. 그리고 PM 브리지용 plugins 레지스트리.
 */
export class FakeApp {
  private files = new Map<string, TFile>()
  private frontmatter = new Map<string, Fm>()
  private pmPlugin: unknown = null

  /** processFrontMatter 가 실제로 파일을 쓴 횟수. 실패 경로 검증에 쓴다. */
  writeCount = 0

  addFile(path: string, fm: Fm | null, mtime = 0): TFile {
    const file = new TFile()
    file.path = path
    file.name = path.split('/').pop() ?? path
    file.basename = file.name.replace(/\.md$/, '')
    file.extension = 'md'
    file.stat = { ctime: 0, mtime, size: 0 }
    this.files.set(path, file)
    if (fm) this.frontmatter.set(path, fm)
    else this.frontmatter.delete(path)
    return file
  }

  deleteFile(path: string): void {
    this.files.delete(path)
    this.frontmatter.delete(path)
  }

  renameFile(oldPath: string, newPath: string): void {
    const file = this.files.get(oldPath)
    const fm = this.frontmatter.get(oldPath)
    if (!file) return
    this.files.delete(oldPath)
    this.frontmatter.delete(oldPath)
    file.path = newPath
    file.name = newPath.split('/').pop() ?? newPath
    file.basename = file.name.replace(/\.md$/, '')
    this.files.set(newPath, file)
    if (fm) this.frontmatter.set(newPath, fm)
  }

  fm(path: string): Fm | undefined {
    return this.frontmatter.get(path)
  }

  setPmPlugin(plugin: unknown): void {
    this.pmPlugin = plugin
  }

  vault = {
    getMarkdownFiles: (): TFile[] => [...this.files.values()],
    getAbstractFileByPath: (p: string): TFile | null => this.files.get(p) ?? null,
    on: () => ({})
  }

  metadataCache = {
    getFileCache: (f: TFile): { frontmatter?: Fm } | null => {
      if (!this.files.has(f.path)) return null
      const fm = this.frontmatter.get(f.path)
      return fm ? { frontmatter: fm } : {}
    },
    on: () => ({})
  }

  fileManager = {
    processFrontMatter: async (f: TFile, cb: (fm: Fm) => void): Promise<void> => {
      const fm = this.frontmatter.get(f.path) ?? {}
      const snapshot = JSON.stringify(fm)
      cb(fm)
      this.frontmatter.set(f.path, fm)
      if (JSON.stringify(fm) !== snapshot) this.writeCount += 1
    }
  }

  plugins = {
    getPlugin: (id: string): unknown => (id === 'project-manager' ? this.pmPlugin : null)
  }
}

/** FakeApp 을 obsidian 의 App 자리에 끼워 넣는다. */
export function asApp(app: FakeApp): never {
  return app as never
}
