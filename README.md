# Quack 꽥

나 혼자 쓰는 로컬 "두 번째 뇌". 칸반 보드(Jira), 마크다운 위키(Confluence/Notion), 그리고 Claude가 그 내용을 찾아 답하는 RAG를 한곳에 모았다.

- 앱은 저장하고 검색만 한다. 답은 Claude(구독)가 **MCP**로 Quack을 검색하고 읽어서, 출처를 달아 만든다. 앱에 API 키나 LLM 호출은 없다.
- PC 안에서만 돈다. 포트는 `127.0.0.1`에만 열리고, 로그인 같은 건 없다.

## 화면

| 보드 | 문서 |
|---|---|
| <!-- 캡처: docs/images/board.png --> _캡처 예정_ | <!-- 캡처: docs/images/docs.png --> _캡처 예정_ |

| Claude에서 검색 | 다크 모드 |
|---|---|
| <!-- 캡처: docs/images/claude-search.png --> _캡처 예정_ | <!-- 캡처: docs/images/dark.png --> _캡처 예정_ |

## 할 수 있는 것
- **보드**: 할 일 / 진행 중 / 완료 칸반. 드래그로 상태를 바꾸고, 이슈 키는 `QK-12` 형식이다.
- **문서**: 마크다운 위키. 하위 페이지로 계층을 만들 수 있다.
- **검색**: `/`를 누르면 이슈와 문서를 한 번에 찾는다.
- **Claude 연동**: "Quack에서 토큰 재발급 정리한 거 찾아줘"라고 하면 Claude가 찾아 읽고 출처를 달아 답한다. 이슈나 문서를 만들고 고치는 것도 시킬 수 있다. 삭제는 일부러 막아 두었다.
- 단축키: `/` 검색, `n` 새로 만들기, `Ctrl+S` 문서 저장, `Esc` 편집 취소

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
| `quack smoke` | 실행 중인 앱에 스모크 테스트 |

PowerShell에서는 `.\quack`으로 부른다.

## Claude 연결

### Claude Code
이 폴더에서 Claude Code를 열면 `.mcp.json`으로 자동 연결된다. 처음 한 번만 `quack` 서버 사용을 승인하면 된다.

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
scripts/                  스모크 테스트, Claude Desktop 중계와 등록
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

## 참고
마스코트는 칸쵸메(금색의 갓슈)를 따라 그린 개인용 팬아트다. 공개 배포나 홍보에 쓰지 않는다.
