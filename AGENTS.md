# Quack — 에이전트 작업 지시서

## 이 프로젝트는 무엇인가
**나 혼자 쓰는 로컬 전용 "두 번째 뇌"**. Jira(칸반 이슈) + Confluence/Notion(마크다운 위키) + RAG를 한 곳에 모았다.
- RAG는 웹 화면 안에 없다. 앱은 저장·검색만 하고, **MCP 서버로 검색 도구를 열어서 Claude(구독)가 찾고 → 읽고 → 출처를 달아 답한다.** API 키나 LLM 호출 코드를 앱에 넣지 말 것.
- 사용자는 1명, PC 밖으로 노출하지 않는다. **로그인, 권한, 담당자, 스프린트 같은 팀 기능은 만들지 않는다.**
- 원칙은 **최소 구현**이다. 새 의존성, 추상화, "나중을 위한" 구조는 넣지 않는다. 일부러 잘라낸 지점에는 `ponytail:` 주석으로 한계와 업그레이드 경로를 적는다.
- 사용자는 한국어로 대화한다. 주력 스택은 Spring이다.

## 구조
```
docker-compose.yml        postgres:16 + app. 둘 다 127.0.0.1에만 바인딩
Dockerfile                gradle:jdk21로 빌드 → temurin 21 jre, -Xmx256m
build.gradle              Spring Boot 4.1.2 + Spring AI BOM 2.0.2 (두 버전은 짝이 맞아야 함)
start.bat                 compose up --build 후 브라우저 열기
.mcp.json                 Claude Code용 MCP 연결 (http://localhost:8765/mcp)
src/main/java/quack/
  QuackApplication.java   ItemTools를 MCP ToolCallbackProvider로 등록
  ItemRepository.java     JdbcClient + SQL 전부 (JPA 안 씀). Item / Hit record
  ItemController.java     REST /api/**
  ItemTools.java          MCP 도구 4개: search, get, create, update (@Tool)
src/main/resources/
  application.yml         DB, Jackson SNAKE_CASE, MCP(STREAMABLE), 정적 파일 no-cache
  schema.sql              items 테이블 (CREATE IF NOT EXISTS, 기동 때마다 실행)
  static/index.html       프론트 전부. 빌드 도구 없는 HTML/CSS/JS 파일 하나
```

## 실행
| 방법 | 명령 | 주소 |
|---|---|---|
| 전체 (Docker) | `docker compose up -d --build` 또는 `start.bat` | 앱 http://localhost:8765, MCP http://localhost:8765/mcp |
| IntelliJ 개발 | `docker compose up -d db` 후 IntelliJ에서 `QuackApplication` 실행 | 앱 http://localhost:8080, DB localhost:15432 |

- 컨테이너 이름은 `quack-app`, `quack-db-1`이고 compose 프로젝트 이름은 `quack`이다.
- **8000, 5432 포트는 이 PC의 다른 프로젝트가 쓰고 있다.** 그래서 8765와 15432를 쓴다. 바꿀 때는 충돌을 먼저 확인할 것.
- 정적 파일이 jar 안에 들어가므로, **index.html을 고친 뒤에는 `docker compose up -d --build app`으로 다시 빌드**해야 Docker 쪽에 반영된다.
- 백업: `docker compose exec db pg_dump -U postgres postgres > backup.sql` (`.gitignore`에 포함됨)

## 데이터 모델
테이블은 `items` 하나다. 이슈와 문서를 한 테이블에 두는 이유는 검색을 한 번에 하기 위해서다.
- `kind`: `issue` | `page`
- `status`: `todo` | `doing` | `done` (이슈 전용, 기본 `todo`)
- `prio`: `high` | `mid` | `low` (이슈 전용, 기본 `mid`)
- `parent_id`: 페이지 계층. `ON DELETE CASCADE`라서 부모를 지우면 하위 페이지도 같이 지워진다.
- `body`: 마크다운
- `created_at`, `updated_at`: 보드는 `updated_at` 순으로 정렬한다. 그래서 상태를 바꾼 카드는 그 컬럼 맨 아래로 간다.
- 화면의 이슈 키는 `QK-{id}`다. DB에 따로 저장하지 않고 id로 표시만 한다.
- **마이그레이션 도구가 없다.** 스키마를 바꾸면 `schema.sql`은 새 DB에만 적용되니까, 기존 DB에는 `ALTER`를 직접 실행해야 한다. 컬럼을 추가하면 Item record, `FIELDS` 화이트리스트, 프론트를 함께 고칠 것.

## API (REST, JSON은 snake_case)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/items?kind=` | 목록 |
| GET | `/api/items/{id}` | 단건 (없으면 404) |
| POST | `/api/items` | 생성 `{kind, title, body?, status?, prio?, parent_id?}` |
| PATCH | `/api/items/{id}` | 부분 수정. 보낸 키만 바뀌고, 명시한 `null`은 그 값을 지운다 |
| DELETE | `/api/items/{id}` | 삭제 (본문 없는 200) |
| GET | `/api/search?q=&kind=` | 검색 (최대 20개) |

- PATCH는 `FIELDS` 화이트리스트로 컬럼명을 거른 뒤에 SQL을 만든다. 이 화이트리스트를 지우면 SQL 인젝션이 생긴다.

## MCP
- Spring AI `spring-ai-starter-mcp-server-webmvc`, streamable HTTP 방식, 엔드포인트는 `/mcp`.
- 도구는 `ItemTools`의 `@Tool` 메서드다. **도구 설명(description)은 Claude가 읽는 프롬프트**이므로 동작을 바꾸면 설명도 같이 고칠 것.
- **MCP 응답 JSON은 camelCase**(`parentId`)다. REST는 snake_case다. Spring AI가 자체 매퍼를 쓰기 때문이고, 의도된 차이다.
- MCP에는 삭제 도구가 없다. 추가하면 Claude가 사용자 데이터를 지울 수 있게 되므로, 넣기 전에 사용자와 상의한다.
- Claude Desktop에 연결하려면 `npx mcp-remote http://localhost:8765/mcp`를 stdio 서버로 등록해야 한다(아직 안 함).

## 검색 (RAG의 "찾기")
- 공백으로 나눈 단어를 `ILIKE '%단어%'`로 찾는다. 점수는 제목 일치 ×2 + 본문 일치다. `%`, `_`, `\`는 이스케이프한다.
- 한국어는 조사가 붙으면 안 맞는다(`로그인을`). 그래서 도구 설명에서 Claude에게 짧은 어간으로 찾고 동의어로 재검색하라고 안내한다.
- 의미 기반 검색(임베딩)은 아직 없다. 필요해지면 pgvector를 붙인다. DB 이미지를 `pgvector/pgvector:pg16`(debian 기반)으로 바꾸면 지금 이미지(alpine)와 정렬 규칙이 달라서 인덱스가 꼬일 수 있다. **바꾸기 전에 pg_dump로 백업하고, 바꾼 뒤 복원**할 것.

## 프론트 (`static/index.html`)
- 프레임워크, 빌드 도구, npm 없음. 외부 의존성은 CDN으로 버전을 고정한 3개뿐이다: Wanted Sans 1.0.3(폰트), marked 18.1.1, DOMPurify 3.4.17. 버전을 올릴 때는 배포된 지 2주 넘은 버전만 쓴다.
- 라우팅은 해시로 한다: `#board`, `#docs`, `#docs/{id}`, `#issue/{id}`(보드로 바꾼 뒤 그 이슈 다이얼로그를 연다).
- **보안 규칙**:
  - 마크다운은 반드시 `DOMPurify.sanitize(marked.parse(...))`로만 렌더링한다. Claude가 MCP로 쓴 글도 여기로 들어온다.
  - 그 밖의 텍스트는 `esc()`로 이스케이프하거나 `textContent`로 넣는다.
- 스타일은 노션(문서)과 Linear(보드) 느낌이다. 색은 `:root`의 CSS 변수로 관리하고, 다크 모드는 `prefers-color-scheme`로 처리한다. 새 색을 하드코딩하지 말 것.
- 단축키: `/` 검색, `n` 새로 만들기, `Ctrl+S` 문서 저장, `Esc` 편집 취소. 저장 안 한 변경이 있으면 취소나 창 닫기 때 확인한다.
- 이슈 다이얼로그 저장은 form의 `submit` 이벤트(`e.submitter.value === 'save'`)에서 처리한다. `dialog`의 `close` 이벤트는 내장 브라우저에서 발생하지 않은 적이 있어서 쓰지 않는다.
- **마스코트**: `mascot(mood, size)`가 인라인 SVG를 만든다. mood는 `idle`, `proud`, `shock`, `cry`다. `hey(mood, 대사)`는 빈 상태에 쓰는 마스코트 + 대사 묶음이다. 대사는 허세 부리고 투덜대는 반말 톤이다(예: "할 일이 없다! 역시 나야!", "꽥?! 없는데…?").
  - 칸쵸메(금색의 갓슈)를 따라 그린 **팬아트**다. 개인용으로만 쓰고, 공개 배포나 홍보용으로 쓰지 않는다.
  - 사용자가 캐릭터 이미지 세트를 줄 수 있다. 그때는 `mascot()`이 `static/mascot/{mood}.png`를 쓰도록 바꾸고, 이미지가 없는 표정만 SVG로 남긴다.

## 검증 방법 (작업 후 반드시)
1. `docker compose up -d --build` → `docker logs quack-app`에서 `Started QuackApplication`와 `Registered tools: 4`를 확인한다.
2. REST: curl로 생성, 수정, 검색, 404, cascade 삭제를 확인한다.
   - **Windows Git Bash에서 `curl -d '한글'`을 쓰면 인코딩이 깨진다.** 본문을 heredoc으로 파일에 쓰고 `--data-binary @file`로 보낼 것.
3. MCP: `initialize` → `Mcp-Session-Id` 헤더 받기 → `notifications/initialized` → `tools/list`, `tools/call` 순서로 호출한다. 헤더 `Accept: application/json, text/event-stream`이 필요하다. 이 폴더에서 연 Claude Code 세션이면 `quack` MCP 도구를 직접 호출해도 된다.
4. 화면: 브라우저로 보드(추가, 드래그, 다이얼로그), 문서(생성, 편집, 저장, 하위 페이지), 검색을 확인한다. 라이트와 다크 둘 다 본다.
   - DevTools 콘솔의 `$`는 페이지의 `$`가 아니다. `document.getElementById`를 쓸 것.
5. **테스트 데이터는 반드시 지운다.** 사용자의 실제 데이터가 들어 있는 DB다.

## 하지 말 것
- `docker compose down -v` 금지. 볼륨에 사용자 데이터가 있다. 데이터를 지워야 하는 작업은 먼저 사용자에게 확인한다.
- 포트를 `0.0.0.0`에 바인딩하지 않는다. 인증이 없다.
- 프론트에 React, Tailwind, 번들러를 들이지 않는다(사용자가 가벼운 구성을 원함).
- 앱 안에 LLM API 호출이나 채팅 UI를 넣지 않는다. AI 쪽은 MCP를 통해서만 붙인다.

## 남은 작업 (우선순위 순 아님)
- 문서 본문의 `QK-12`를 해당 이슈로 이동하는 링크로 바꾸기 (지라와 위키 연결)
- 편집 중에 사이드바로 다른 문서로 이동하면 확인 없이 내용이 사라짐
- 이슈 설명의 마크다운 미리보기
- README (실행 방법, MCP 연결 방법)
- Claude Desktop MCP 연결 (mcp-remote)
- 검색 품질이 부족해지면 pgvector 임베딩 검색
