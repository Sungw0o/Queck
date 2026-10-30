# Quack 꽥

나 혼자 쓰는 로컬 "두 번째 뇌". 칸반 보드(Jira), 마크다운 위키(Confluence/Notion), 그리고 Claude가 그 내용을 찾아 답하는 RAG를 한곳에 모았다.

- 앱은 저장하고 검색만 한다. 답은 Claude(구독)가 **MCP**로 Quack을 검색하고 읽어서, 출처를 달아 만든다. 앱에 API 키나 LLM 호출은 없다.
- PC 안에서만 돈다. 포트는 `127.0.0.1`에만 열리고, 로그인 같은 건 없다.
- 첫 화면은 홈이다. 보드·문서·사용 가이드로 바로 이동할 수 있다. [사람용 가이드](src/main/resources/static/user-guide.md)와 [에이전트 가이드](src/main/resources/static/agent-guide.md)는 앱의 **사용 가이드** 메뉴에서도 읽고 마크다운으로 받을 수 있다.

## 화면

| 보드 | 문서 |
|---|---|
| <!-- 캡처: docs/images/board.png --> _캡처 예정_ | <!-- 캡처: docs/images/docs.png --> _캡처 예정_ |

| Claude에서 검색 | 다크 모드 |
|---|---|
| <!-- 캡처: docs/images/claude-search.png --> _캡처 예정_ | <!-- 캡처: docs/images/dark.png --> _캡처 예정_ |

## 할 수 있는 것
- **보드**: 할 일 / 진행 중 / 완료 칸반. 드래그로 상태를 바꾸고, 이슈 키는 `QK-12` 형식이다.
- **이슈 문서 2개**: `사람용 요약`에는 목적·완료 조건을 짧게, `에이전트 문서`에는 결정·진행·검증·다음 작업과 출처를 적는다. 각각 작성·미리보기할 수 있고 함께 저장한다. 기존 이슈 설명은 사람용 요약에 그대로 남는다.
- **이슈 초안 보호**: 저장 성공 후 창이 닫히며, 실패하면 입력한 두 문서를 유지해 재시도할 수 있다. 변경 후 취소·Esc·새로고침·뒤로 가기는 확인을 거친다. 저장 중에는 편집과 중복 저장을 잠시 막는다.
- **문서**: 마크다운 위키. 하위 페이지로 계층을 만들 수 있다.
- **지식 위키**: 원본 자료와 정리된 지식을 구분한다. 원본 등록·중복 감지, 출처/역방향 연결, 색인·발행 기록·재검토 표시·구조 점검을 제공한다. 연결된 에이전트가 MCP로 원문을 읽고 위키를 발행한다.
- **안전한 수정**: 읽은 버전이 다르면 저장을 막고 초안과 최신 내용을 비교한다. 변경 이력에서 과거 내용을 새 버전으로 복원한다. 이력은 기능 설치 시점부터 쌓이며 삭제한 문서는 복구하지 못한다.
- **입출력**: .md/.txt를 원본 또는 메모로 가져오고 개별 Markdown·전체 Markdown ZIP으로 내보낸다. 내보내기는 DB 백업을 대체하지 않는다.
- **완료 이슈 지식화**: 완료된 이슈 창의 **위키로 남기기**로 두 문서를 원문 그대로 보존한다. 자동 요약은 하지 않는다.
- **검색**: `/`를 누르면 이슈와 문서를 한 번에 찾는다.
- **Claude 연동**: "Quack에서 토큰 재발급 정리한 거 찾아줘"라고 하면 Claude가 찾아 읽고 출처를 달아 답한다. 이슈나 문서를 만들고 고치는 것도 시킬 수 있다. 삭제는 일부러 막아 두었다.
- 단축키: `/` 검색, `n` 새로 만들기, `Ctrl+S` 문서 저장, `Esc` 편집 취소

## 두 문서와 RAG 사용

MCP의 `search`가 제목·사람용 요약·에이전트 문서·위키 본문을 키워드로 검색한다. 결과에는 일치한 문서 종류(`source`), 발췌, 원문 링크(`url`)가 있다. 에이전트 문서 검색 결과는 해당 문서를 바로 연다.

Claude/Codex에 "Quack에서 ○○ 찾아서 에이전트 문서까지 읽고 출처와 함께 알려줘"라고 요청하면 `search` → `get`으로 원문을 읽고 답한다. `get`은 두 문서를 함께 반환하고, `create`/`update`의 `agentBody`로 에이전트 문서만 작성할 수 있다. 작업 인수인계 형식과 검색 절차는 [docs/rag.md](docs/rag.md)에 있다.

**키워드 기반 RAG**이며 임베딩·의미 검색은 없다. 앱이 문서를 자동 요약하거나 에이전트를 자동 실행하지 않는다. 에이전트가 작업 후 기록해야 다음 에이전트가 이어받을 수 있다.

### 기존 DB 업그레이드

처음 생성한 DB에는 새 컬럼이 자동으로 들어간다. 이전 버전 DB를 계속 쓰는 PC에서는 새 앱 실행 전에 한 번 실행한다. 기존 문서 본문은 수정하지 않는다.

```powershell
.\quack backup
Get-Content -Raw scripts/migrate-issue-agent.sql | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres postgres
Get-Content -Raw scripts/migrate-knowledge.sql | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres postgres
Get-Content -Raw src/main/resources/schema.sql | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres postgres
docker compose up -d --build app
```

백업이 성공한 뒤에만 다음 명령을 진행한다.

## 필요한 것
- **Docker Desktop**. 재부팅 뒤에도 자동으로 뜨게 하려면 Settings → General → "Start Docker Desktop when you sign in"을 켠다.
- **Node.js 18 이상**: Claude Desktop 연결에만 쓴다.
- **Git Bash**: `quack smoke`에만 쓴다.
- 포트 **8765**(앱)와 **15432**(DB)가 비어 있어야 한다.

## 실행

```bash
quack
```

이 폴더에서 실행하거나 `quack.bat`을 더블클릭한다. 빌드해서 띄우고, 앱이 응답하면 http://localhost:8765 를 연다. 첫 빌드는 몇 분 걸린다.

| 명령 | 하는 일 |
|---|---|
| `quack` | 빌드, 실행, 브라우저 열기 |
| `quack stop` | 멈춤 (데이터는 그대로) |
| `quack logs` | 앱 로그 보기 |
| `quack db` | DB만 띄우기 (IntelliJ에서 `QuackApplication` 실행할 때) |
| `quack backup` | DB를 `backups/`에 덤프하고 30일 지난 덤프는 정리 |
| `quack schedule` | 매일 12:00 자동 백업을 작업 스케줄러에 등록 |
| `quack desktop` | Claude Desktop에 Quack MCP 등록 |
| `quack global` | 다른 프로젝트 폴더에서도 Quack·Notion·GitHub MCP를 쓰도록 전역 등록 (`--dry-run`은 미리보기만) |
| `quack smoke` | 실행 중인 앱에 스모크 테스트 |

PowerShell에서는 `.\quack`으로 부른다.

## AI 연결
Claude Code, Codex, Claude Desktop 세 군데서 쓸 수 있다. 작업 규칙은 셋 다 [AGENTS.md](AGENTS.md)를 따른다.

### Claude Code
이 폴더에서 Claude Code를 열면 `.mcp.json`으로 자동 연결된다. 처음 한 번만 `quack` 서버 사용을 승인하면 된다. 자주 하는 작업은 `/mcp__quack__organize_source`(원본 정리), `/mcp__quack__import_notion`(Notion 가져오기), `/mcp__quack__github_retro`(GitHub 회고) 프롬프트로 부른다.

### Codex
이 폴더에서 Codex를 열면 `.codex/config.toml`로 연결된다. 처음 열 때 묻는 **프로젝트 신뢰**와 **훅 신뢰**를 허용해야 MCP와 가드가 켜진다. `search`, `get`, `wiki_context`, `history`는 읽기 전용이며 묻지 않고 실행한다. 생성·수정·발행·복원 도구는 기존 승인 정책을 유지한다.

### 외부 계정 (Notion, GitHub)
Claude Code와 Codex는 이 폴더에서 Notion·GitHub 공식 MCP에도 연결된다. 토큰은 파일에 넣지 않는다.
- **Notion**: OAuth. Claude Code는 `/mcp`에서 `notion`을 골라 로그인하고, Codex는 `codex mcp login notion`을 실행한다.
- **GitHub**: [PAT](https://github.com/settings/personal-access-tokens)를 만들어 사용자 환경변수 `GITHUB_PAT`에 넣고 Claude Code·Codex를 다시 연다. 권한은 필요한 저장소와 범위만 준다. 비어 있으면 `github` 서버만 연결에 실패한다.
- Claude Desktop의 Notion은 Desktop 설정의 커넥터로 붙인다.

### 다른 프로젝트에서 쓰기
위 연결은 이 폴더에서만 켜진다. 다른 프로젝트 폴더에서도 쓰려면 `quack global --dry-run`으로 추가될 서버를 확인한 뒤 `quack global`을 실행한다.
- Claude Code는 user 범위(`~/.claude.json`), Codex는 `~/.codex/config.toml`에 이 저장소의 `.mcp.json`·`.codex/config.toml` 내용을 복사한다. Codex 전역 파일은 `.bak`을 남긴다.
- 이미 같은 이름의 서버가 있으면 건너뛴다. 기존 항목을 덮어쓰거나 지우지 않는다. 설정을 바꾼 뒤 다시 반영하려면 해당 전역 항목을 지우고 다시 실행한다.
- 가드 훅은 전역으로 옮기지 않는다. 각 프로젝트의 규칙은 그 프로젝트에 둔다.

### Claude Desktop
Desktop은 로컬 서버를 stdio로만 붙이기 때문에 `scripts/mcp-bridge.mjs`가 중간에서 이어 준다.

1. Claude Desktop **밖에서** 터미널(cmd, Windows Terminal)을 연다.
2. `quack desktop`을 실행한다. "종료해 주세요, 기다리는 중…"이 뜬다.
3. 트레이 아이콘에서 Claude를 **종료**한다. 창만 닫으면 안 된다.
4. "등록 완료"가 뜨면 Claude Desktop을 다시 켠다.

Desktop이 켜져 있는 동안에는 설정 파일을 자기가 다시 쓰기 때문에, 직접 고치면 사라진다. 그래서 꺼질 때까지 기다렸다가 등록한다. 등록 전 설정은 `.bak`으로 남는다.

## 백업과 복원
- `quack schedule`을 한 번 해 두면 매일 12:00에 `backups/quack-YYYYMMDD-HHMM.sql`이 생긴다. 놓친 백업은 다음 로그인 때 돌고, 30일이 지난 덤프는 지운다.
- 백업이 성공했는지는 `backups/backup.log`에 남는다. Docker가 꺼져 있었으면 `FAILED`로 기록된다.
- 복원은 **빈 DB에만** 한다.
  ```bash
  docker compose exec -T db psql -U postgres postgres < backups/quack-YYYYMMDD-HHMM.sql
  ```
- 데이터는 Docker 볼륨 `quack_pgdata`에 있다. `docker compose down -v`를 하면 지워진다.

## 구조

```
quack.bat                 실행과 운영 명령
docker-compose.yml        postgres:16 + app (127.0.0.1에만 바인딩)
src/main/java/quack/      Spring Boot 4 + Spring AI MCP 서버 (REST /api, MCP /mcp)
src/main/resources/static/index.html   프론트 전부 (빌드 도구 없음)
src/main/resources/static/*-guide.md  앱에서 읽는 사람용·에이전트용 가이드 원본
scripts/                  스모크 테스트, 위험 명령 가드, Claude Desktop 중계와 등록
.claude/ .codex/          Claude Code와 Codex 설정 (MCP, 가드 훅)
docs/plan.md              개발 계획
docs/design.md            디자인 가이드
AGENTS.md                 작업 지시서 (에이전트와 사람 공용)
```

스택은 Java 21, Spring Boot 4.1, Spring AI 2.0 MCP Server(streamable HTTP), PostgreSQL 16, JdbcClient다. 프론트는 HTML 파일 하나와 marked, DOMPurify, Wanted Sans뿐이다.

## 개발
- 규칙, API, 데이터 모델, 검증 방법은 [AGENTS.md](AGENTS.md)에 있다. 남은 일은 [docs/plan.md](docs/plan.md), 화면 규칙은 [docs/design.md](docs/design.md)에 있다.
- 클론한 뒤 Git 훅을 켠다.
  ```bash
  git config core.hooksPath .githooks
  ```
- 커밋 제목은 `<gitmoji> <type>: <요약>` 형식이다. 예: `✨ feat: 문서의 QK 번호를 링크로`
- push하면 GitHub Actions가 compose로 앱을 띄우고 `scripts/smoke.sh`를 돌린다.
- 스모크는 REST/MCP 10개 도구·3개 프롬프트·충돌·이력·위키 발행과 고정된 검색 평가 10문항을 검사한다. `node scripts/rag-eval.mjs`로 검색 평가만 반복할 수 있다. 이는 검색 근거 평가이며 LLM 답변의 사실성을 측정하지 않는다.

## 참고
마스코트는 칸쵸메(금색의 갓슈)를 따라 그린 개인용 팬아트다. 공개 배포나 홍보에 쓰지 않는다.
