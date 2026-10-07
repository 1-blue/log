# n8n Workflow 보관 위치

n8n UI에서 export한 Workflow JSON을 이 디렉터리에 저장한다.

- `career-analysis.json`: HMAC 검증, Wanted 수집·수동 원문 전달, 결정론적 파서 실패 시 OpenAI 원문 구조화 보완, OpenAI 2단계 분석, Slack Bot API·에러 Webhook 분기, 선택적 재시도와 Worker callback을 처리하는 로컬 Workflow 원본
- `career-analysis-smoke.json`: 롤백을 위해 보존하는 비활성 초기 연결 확인 Workflow
- 기존 OpenAI Credential을 원문 보완·분석 5개 노드와 OCR 최초·재시도 HTTP 노드 2개에서 공유한다. 배포 스크립트가 기존 Credential ID를 유지한다.
- Slack 알림 노드를 실행하려면 16단계에서 Bot API 최초·재시도 노드에 같은 Slack Credential을 연결해야 한다. 에러 Webhook은 기존 `SLACK_ERROR_WEBHOOK_URL`을 사용한다.
- export 파일에는 Credential 이름과 ID가 포함될 수 있으므로 비밀값, 인증 헤더, 개인 식별 정보가 없는지 확인한 뒤 커밋한다.
- Credential 자체를 export하거나 `--decrypted` 옵션을 사용한 결과를 이 디렉터리에 저장하지 않는다.
- `job_posting_extraction` 요청은 Worker가 JSON-LD·HTML 파싱에 실패했을 때만 발송되며, OpenAI는 원문을 구조화하고 Worker는 근거 문자열을 다시 검증한 뒤 저장한다.
- `document_extraction`은 signed PDF 다운로드 → 크기·해시 확인 → 전체 페이지 렌더링 → `gpt-5.6-luna` Responses API AI OCR → 검증된 텍스트 callback 순서다. 텍스트 레이어 추출과 fallback은 사용하지 않는다. `pdf-parse`는 페이지 수 확인·이미지 렌더링에만 필요하다.
- PDF는 20MB·30페이지 이하, AI 요청은 180초 제한이다. 일시적 오류만 1회 재시도한다. 모든 페이지의 결과가 있거나 수동 보정이 완료된 문서만 공고 분석에 사용할 수 있다.
- 공고 분석은 저장된 추출 텍스트·프로필·확인 근거를 사용한다. 화면을 열 때 추가 AI 호출을 하지 않는다.
- 모든 유료 AI 노드 앞에서 `/v1/internal/ai-usage`에 호출 시작을 기록한다. 기록 실패 시 AI를 호출하지 않고 실패 callback으로 이어진다. 응답 사용량 기록이 실패하면 본업 결과는 유지하고 비용 미집계 호출로 남긴다. AI 오류·불완전 응답에 포함된 토큰과 재시도 비용도 각각 기록한다.
- Slack 문서 알림은 공고 스레드 없이 발송하며, 공고 분석 완료 알림은 기존 공고 스레드를 사용한다. 설정 거절과 네트워크 전달 불명을 구분한다. 전달 불명은 자동 재전송하지 않으며 관리자 `/admin/notifications`에서 중복 위험을 확인한 뒤 복구한다.

## 생성 코드 갱신

정책 수정 뒤 해당 updater를 실행하고 `pnpm test`로 실제 Workflow에 포함된 코드를 검증한다.

```bash
node apps/n8n/scripts/update-document-ocr.mjs
node apps/n8n/scripts/update-ai-usage.mjs
node apps/n8n/scripts/update-slack-policy.mjs
node apps/n8n/scripts/update-analysis-readability.mjs
```

DB 추가 migration → Worker → n8n → Blog 순서로 반영해야 새 계약을 이해하지 못하는 서버에 Workflow가 먼저 요청하지 않는다. 기존 실행 중인 작업이 끝난 뒤 Workflow를 전환하고, 운영 재분석·재추출은 별도 요청으로 실행한다.
