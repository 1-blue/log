# n8n Workflow 보관 위치

n8n UI에서 export한 Workflow JSON을 이 디렉터리에 저장한다.

- `career-analysis-smoke.json`: 로컬 Docker와 Webhook 연결만 확인하는 임시 Workflow
- 실제 분석 Workflow는 이후 단계에서 같은 계약과 Webhook 경로를 기준으로 확장한다.
- export 파일에는 Credential 이름과 ID가 포함될 수 있으므로 비밀값, 인증 헤더, 개인 식별 정보가 없는지 확인한 뒤 커밋한다.
- Credential 자체를 export하거나 `--decrypted` 옵션을 사용한 결과를 이 디렉터리에 저장하지 않는다.
