# n8n 자동화 환경

이 디렉터리는 취업 준비 자동화를 위한 n8n 실행 구성을 보관한다.

현재 2단계에서는 환경변수 예시와 계약 문서 위치만 준비한다. Docker Compose, n8n Workflow export, PostgreSQL volume은 n8n 로컬 환경 단계에서 추가한다.

원칙:

- 실제 `.env`, n8n Credentials, 암호화 키, 실행 데이터는 커밋하지 않는다.
- `workflows/`에는 export한 JSON만 저장한다.
- 공고 분석 요청·callback payload는 `packages/contracts`의 JSON Schema를 기준으로 한다.
