# n8n Workflow 보관 위치

n8n UI에서 export한 Workflow JSON을 이 디렉터리에 저장한다.

- `career-analysis.json`: HMAC 검증, Wanted 수집·수동 원문 전달, 결정론적 파서 실패 시 OpenAI 원문 구조화 보완, OpenAI 2단계 분석, Slack Bot API·에러 Webhook 분기, 선택적 재시도와 Worker callback을 처리하는 로컬 Workflow 원본
- `career-analysis-smoke.json`: 롤백을 위해 보존하는 비활성 초기 연결 확인 Workflow
- OpenAI 노드를 실행하려면 n8n에서 `OpenAI Career Analysis` Credential을 만든 뒤 원문 보완 1개와 분석 최초·재시도용 4개, 총 5개 노드에 연결해야 한다.
- Slack 알림 노드를 실행하려면 16단계에서 Bot API 최초·재시도 노드에 같은 Slack Credential을 연결해야 한다. 에러 Webhook은 기존 `SLACK_ERROR_WEBHOOK_URL`을 사용한다.
- export 파일에는 Credential 이름과 ID가 포함될 수 있으므로 비밀값, 인증 헤더, 개인 식별 정보가 없는지 확인한 뒤 커밋한다.
- Credential 자체를 export하거나 `--decrypted` 옵션을 사용한 결과를 이 디렉터리에 저장하지 않는다.
- `job_posting_extraction` 요청은 Worker가 JSON-LD·HTML 파싱에 실패했을 때만 발송되며, OpenAI는 원문을 구조화하고 Worker는 근거 문자열을 다시 검증한 뒤 저장한다.
- `document_extraction` 요청은 PDF signed URL을 `문서 PDF 다운로드`로 받은 뒤 `PDF 텍스트 추출`에서 텍스트를 만들고, `문서 추출 결과 구성` 또는 `문서 추출 실패 구성`을 거쳐 Worker callback으로 반환한다.
