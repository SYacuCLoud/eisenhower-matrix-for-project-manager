import 'obsidian'

declare module 'obsidian' {
  interface App {
    /**
     * 비공개 API. Project Manager 의 설정을 읽기 위해서만 쓰며,
     * 사용처는 전부 옵셔널 체이닝 + 타입 가드로 감싼다.
     */
    plugins?: {
      getPlugin?(id: string): unknown
      enabledPlugins?: Set<string>
    }
  }
}
