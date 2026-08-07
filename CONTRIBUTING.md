# 기여하기

버그 제보와 개선 제안을 환영합니다. 이 저장소는 아직 공개 Project Manager API가 아닌 일부 내부 뷰 구조에 의존하므로, 문제를 제보할 때 아래 정보를 함께 적어 주세요.

- Obsidian 버전
- Project Manager 버전
- Eisenhower Matrix 버전
- 재현 단계와 기대한 동작
- 가능한 경우 개발자 콘솔의 오류 메시지

코드를 변경할 때는 별도 브랜치에서 작업하고 다음 검사를 모두 통과시켜 주세요.

```bash
npm ci
npm test
npm run check:types
npm run build
```

작업 노트의 프론트매터를 변경하는 코드는 기존 데이터 보존을 최우선으로 합니다. 새 필드를 쓰거나 기존 필드를 삭제하는 변경에는 테스트와 변경 이유가 필요합니다.
