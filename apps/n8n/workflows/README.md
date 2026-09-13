# n8n Workflow 보관 위치

n8n UI에서 export한 Workflow JSON을 이 디렉터리에 저장한다.

- `career-analysis.json`: HMAC 검증, Wanted HTML 수집, 수동 원문 전달, Worker callback을 처리하는 현재 Workflow
- `career-analysis-smoke.json`: 롤백을 위해 보존하는 비활성 초기 연결 확인 Workflow
- AI 분석은 이후 단계에서 현재 계약과 Webhook 경로를 기준으로 확장한다.
- export 파일에는 Credential 이름과 ID가 포함될 수 있으므로 비밀값, 인증 헤더, 개인 식별 정보가 없는지 확인한 뒤 커밋한다.
- Credential 자체를 export하거나 `--decrypted` 옵션을 사용한 결과를 이 디렉터리에 저장하지 않는다.
