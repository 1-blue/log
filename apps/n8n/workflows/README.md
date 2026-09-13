# n8n Workflow 보관 위치

n8n UI에서 export한 Workflow JSON을 이 디렉터리에 저장한다.

- `career-analysis.json`: HMAC 검증, Wanted 수집·수동 원문 전달, OpenAI 2단계 구조화 분석, 선택적 재시도·heartbeat와 Worker callback을 처리하는 비활성 Workflow 원본
- `career-analysis-smoke.json`: 롤백을 위해 보존하는 비활성 초기 연결 확인 Workflow
- OpenAI 분석 노드를 실행하려면 n8n에서 `OpenAI Career Analysis` Credential을 만든 뒤 최초·재시도용 OpenAI 노드 네 개에 연결해야 한다.
- export 파일에는 Credential 이름과 ID가 포함될 수 있으므로 비밀값, 인증 헤더, 개인 식별 정보가 없는지 확인한 뒤 커밋한다.
- Credential 자체를 export하거나 `--decrypted` 옵션을 사용한 결과를 이 디렉터리에 저장하지 않는다.
