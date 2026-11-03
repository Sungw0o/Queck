package quack;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Repository
public class ItemRepository {
    public record Item(long id, String kind, String title, String body, String agentBody, String status, String prio,
                       Long parentId, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                       int revision, String pageType, String sourceUrl, boolean needsReview, String project) {}
    public record Hit(long id, String kind, String title, String status, String snippet, String source, String url,
                      OffsetDateTime updatedAt, long score, int offset, String heading, String pageType, boolean needsReview, String project) {}
    record Candidate(long id, String kind, String title, String status, String text, String source, String url,
                     OffsetDateTime updatedAt, long score, String pageType, boolean needsReview, String project) {}
    public record Revision(long itemId, int revision, String title, String body, String agentBody, String status, String prio, String sourceUrl, OffsetDateTime savedAt) {}
    public record SourceRef(long id, int revision) {}
    public record IngestResult(Item item, boolean duplicate) {}
    public record Link(long id, String title, String kind, String pageType, int revision, int linkedRevision, String relation) {}
    public record Event(long id, Long itemId, Long sourceId, String title, String action, String detail, OffsetDateTime createdAt) {}
    public record Finding(String type, long itemId, String title, String detail) {}
    private static final Set<String> FIELDS = Set.of("title", "body", "agent_body", "status", "prio", "parent_id", "source_url", "project");
    private static final Pattern PROJECT = Pattern.compile("[\\p{L}\\p{N}._-]{0,50}");
    private static final Pattern MENTION = Pattern.compile("#(?:docs|issue)/(\\d+)");
    private static final String REVIEW = """
            (i.page_type = 'wiki' AND (
                NOT EXISTS (SELECT 1 FROM item_links l WHERE l.from_id = i.id AND l.relation = 'source')
                OR EXISTS (SELECT 1 FROM item_links l JOIN items s ON s.id = l.to_id
                           WHERE l.from_id = i.id AND l.relation = 'source' AND l.target_revision <> s.revision)
            ))""";
    private static final String SELECT = "SELECT i.*, " + REVIEW + " AS needs_review FROM items i ";
    private final JdbcClient jdbc;
    ItemRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public List<Item> list(String kind) {
        return jdbc.sql(SELECT + "WHERE CAST(:k AS text) IS NULL OR kind = :k ORDER BY updated_at")
                .param("k", kind).query(Item.class).list();
    }
    public Optional<Item> get(long id) {
        return jdbc.sql(SELECT + "WHERE i.id = :id").param("id", id).query(Item.class).optional();
    }
    private Item lock(long id) {
        return jdbc.sql(SELECT + "WHERE i.id = :id FOR UPDATE OF i").param("id", id).query(Item.class).optional()
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "문서가 없습니다."));
    }
    private static ResponseStatusException error(HttpStatus status, String message) { return new ResponseStatusException(status, message); }
    private static void require(boolean condition, String message) { if (!condition) throw error(HttpStatus.BAD_REQUEST, message); }
    private static void version(Item item, Integer expected) {
        if (expected == null) throw error(HttpStatus.PRECONDITION_REQUIRED, "최신 문서를 읽고 expected_revision을 보내 주세요.");
        if (item.revision() != expected) throw error(HttpStatus.CONFLICT, "문서 #" + item.id() + "의 현재 버전은 " + item.revision() + "입니다 (읽은 버전 " + expected + "). 최신 문서와 초안을 비교해 주세요.");
    }
    private static String text(String value) {
        String result = value == null ? "" : value;
        require(result.length() <= 1_000_000, "문서는 100만 자 이하로 입력해 주세요."); return result;
    }
    private static String title(String value) {
        require(value != null && !value.isBlank() && value.length() <= 300, "제목은 1~300자로 입력해 주세요."); return value.trim();
    }
    /** Lower-case slug so "Quack" and " quack " are one project; '' means none. */
    private static String project(Object value) {
        require(value == null || value instanceof String, "프로젝트 형식을 확인해 주세요.");
        String result = value == null ? "" : ((String) value).strip().toLowerCase(Locale.ROOT);
        require(PROJECT.matcher(result).matches(), "프로젝트는 50자 이하의 글자·숫자·.-_로 입력해 주세요."); return result;
    }
    private static String hash(String value) {
        try {
            String normalized = Normalizer.normalize(value.replace("\r\n", "\n").trim(), Normalizer.Form.NFC);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static String url(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            URI u = URI.create(value.trim()).normalize();
            require(u.getScheme() != null && Set.of("http", "https").contains(u.getScheme().toLowerCase(Locale.ROOT)) && u.getHost() != null && u.getUserInfo() == null,
                    "출처 URL은 인증정보 없는 http/https 주소여야 합니다.");
            return new URI(u.getScheme().toLowerCase(Locale.ROOT), null, u.getHost().toLowerCase(Locale.ROOT),
                    u.getPort(), u.getPath(), u.getQuery(), u.getFragment()).toASCIIString();
        } catch (ResponseStatusException e) { throw e; }
        catch (Exception e) { throw error(HttpStatus.BAD_REQUEST, "출처 URL을 확인해 주세요."); }
    }
    private void parent(Long parentId, Long self) {
        if (parentId == null) return;
        var p = get(parentId).orElseThrow(() -> error(HttpStatus.BAD_REQUEST, "상위 문서가 없습니다."));
        require("page".equals(p.kind()), "상위 항목은 문서여야 합니다.");
        if (self != null) {
            boolean cycle = jdbc.sql("""
                    WITH RECURSIVE chain AS (SELECT id, parent_id FROM items WHERE id = :p
                      UNION SELECT i.id, i.parent_id FROM items i JOIN chain c ON i.id = c.parent_id)
                    SELECT EXISTS(SELECT 1 FROM chain WHERE id = :self)""")
                    .param("p", parentId).param("self", self).query(Boolean.class).single();
            require(!cycle, "문서 계층을 순환시킬 수 없습니다.");
        }
    }
    private void snapshot(long id) {
        jdbc.sql("""
                INSERT INTO item_revisions(item_id, revision, snapshot)
                SELECT id, revision, to_jsonb(items) - 'content_hash' FROM items WHERE id = :id ON CONFLICT DO NOTHING""")
                .param("id", id).update();
    }
    private void event(long id, Long source, String action, String detail) {
        jdbc.sql("INSERT INTO wiki_events(item_id, source_id, action, detail) VALUES (:id,:s,:a,:d)")
                .param("id", id).param("s", source).param("a", action).param("d", detail).update();
    }
    private void mentions(Item item) {
        jdbc.sql("DELETE FROM item_links WHERE from_id = :id AND relation = 'mention'").param("id", item.id()).update();
        var matcher = MENTION.matcher(item.body() + "\n" + item.agentBody());
        while (matcher.find()) {
            long target;
            try { target = Long.parseLong(matcher.group(1)); } catch (NumberFormatException e) { continue; }
            if (target != item.id()) get(target).ifPresent(t -> link(item.id(), t.id(), "mention", t.revision()));
        }
    }
    private void link(long from, long to, String relation, int revision) {
        jdbc.sql("""
                INSERT INTO item_links(from_id,to_id,relation,target_revision) VALUES (:f,:t,:r,:v)
                ON CONFLICT(from_id,to_id,relation) DO UPDATE SET target_revision = EXCLUDED.target_revision""")
                .param("f", from).param("t", to).param("r", relation).param("v", revision).update();
    }

    @Transactional
    public Item create(String kind, String title, String body, String agentBody, String status, String prio, Long parentId,
                       String pageType, String sourceUrl, String project) {
        require(Set.of("issue", "page").contains(kind == null ? "" : kind), "종류는 issue 또는 page여야 합니다.");
        String role = pageType == null ? "note" : pageType;
        require(Set.of("note", "source", "wiki").contains(role), "문서 유형을 확인해 주세요.");
        require("page".equals(kind) || "note".equals(role), "원본·위키 유형은 문서에서만 사용합니다.");
        if ("source".equals(role)) return ingest(title, body, sourceUrl, project).item();
        String cleanTitle = title(title), cleanBody = text(body), cleanAgent = text(agentBody), cleanProject = project(project);
        if ("issue".equals(kind)) {
            status = status == null ? "todo" : status; prio = prio == null ? "mid" : prio;
            require(Set.of("todo", "doing", "done").contains(status), "상태를 확인해 주세요.");
            require(Set.of("high", "mid", "low").contains(prio), "우선순위를 확인해 주세요.");
            require(parentId == null, "이슈에는 상위 문서를 지정할 수 없습니다.");
        }
        parent(parentId, null);
        var inserted = jdbc.sql("""
                INSERT INTO items(kind,title,body,agent_body,status,prio,parent_id,page_type,project)
                VALUES (:k,:t,:b,:a,:s,:p,:parent,:role,:proj) ON CONFLICT DO NOTHING RETURNING id""")
                .param("k", kind).param("t", cleanTitle).param("b", cleanBody).param("a", cleanAgent)
                .param("s", status).param("p", prio).param("parent", parentId).param("role", role).param("proj", cleanProject).query(Long.class).optional();
        long id = inserted.orElseThrow(() -> error(HttpStatus.CONFLICT, "같은 제목의 지식 위키가 있습니다. 기존 문서를 읽고 갱신해 주세요."));
        snapshot(id); Item item = get(id).orElseThrow(); mentions(item); return item;
    }

    @Transactional
    public IngestResult ingest(String title, String body, String sourceUrl, String project) {
        String cleanTitle = title(title), cleanBody = text(body), cleanUrl = url(sourceUrl), cleanProject = project(project);
        require(!cleanBody.isBlank(), "원본 본문을 입력해 주세요. URL만으로 자동 수집하지 않습니다.");
        String fingerprint = hash(cleanBody);
        var inserted = jdbc.sql("""
                INSERT INTO items(kind,title,body,page_type,source_url,content_hash,project)
                VALUES ('page',:t,:b,'source',:u,:h,:proj) ON CONFLICT DO NOTHING RETURNING id""")
                .param("t", cleanTitle).param("b", cleanBody).param("u", cleanUrl).param("h", fingerprint).param("proj", cleanProject).query(Long.class).optional();
        if (inserted.isEmpty()) {
            Item existing = jdbc.sql(SELECT + "WHERE i.page_type = 'source' AND (i.content_hash = :h OR i.source_url = :u) ORDER BY i.id LIMIT 1")
                    .param("h", fingerprint).param("u", cleanUrl).query(Item.class).single();
            if (!hash(existing.body()).equals(fingerprint))
                throw error(HttpStatus.CONFLICT, "같은 URL의 원본 문서 #" + existing.id() + "가 있습니다. 기존 원본을 확인해 수정해 주세요.");
            return new IngestResult(existing, true);
        }
        long id = inserted.get(); snapshot(id); event(id, id, "ingest", "원본 자료 등록");
        return new IngestResult(get(id).orElseThrow(), false);
    }

    @Transactional
    public Optional<Item> update(long id, Map<String, Object> fields) {
        Item before = lock(id);
        Object expected = fields.get("expected_revision");
        require(expected == null || expected instanceof Number n && n.doubleValue() == n.intValue() && n.intValue() > 0, "버전은 양의 정수여야 합니다.");
        version(before, expected instanceof Number n ? n.intValue() : null);
        require(!fields.containsKey("kind") && !fields.containsKey("page_type"), "종류·문서 유형은 생성 후 변경할 수 없습니다.");
        var values = new LinkedHashMap<String, Object>();
        for (String field : fields.keySet()) if (FIELDS.contains(field)) values.put(field, fields.get(field));
        for (String field : List.of("title", "body", "agent_body", "source_url"))
            require(!values.containsKey(field) || values.get(field) == null || values.get(field) instanceof String, "텍스트 필드 형식을 확인해 주세요.");
        if (values.containsKey("title")) values.put("title", title((String) values.get("title")));
        for (String field : List.of("body", "agent_body")) if (values.containsKey(field)) values.put(field, text((String) values.get(field)));
        if (values.containsKey("status")) require(values.get("status") instanceof String s && Set.of("todo","doing","done").contains(s), "상태를 확인해 주세요.");
        if (values.containsKey("project")) values.put("project", project(values.get("project")));
        if (values.containsKey("prio")) require(values.get("prio") instanceof String s && Set.of("high","mid","low").contains(s), "우선순위를 확인해 주세요.");
        if (values.containsKey("parent_id")) {
            require("page".equals(before.kind()), "이슈에는 상위 문서를 지정할 수 없습니다.");
            Object p = values.get("parent_id"); require(p == null || p instanceof Number, "상위 문서 번호를 확인해 주세요.");
            parent(p == null ? null : ((Number) p).longValue(), id);
        }
        if (values.containsKey("source_url")) {
            require("source".equals(before.pageType()), "출처 URL은 원본 자료에서 수정합니다.");
            values.put("source_url", url((String) values.get("source_url")));
        }
        if ("source".equals(before.pageType()) && values.containsKey("body")) {
            require(!((String) values.get("body")).isBlank(), "원본 본문을 비울 수 없습니다.");
            values.put("content_hash", hash((String) values.get("body")));
        }
        if (values.isEmpty()) return Optional.of(before);
        String sets = values.keySet().stream().map(k -> k + " = :" + k).collect(Collectors.joining(", "));
        var statement = jdbc.sql("UPDATE items SET " + sets + ", revision = revision + 1, updated_at = now() WHERE id = :id").param("id", id);
        for (var entry : values.entrySet()) statement = statement.param(entry.getKey(), entry.getValue());
        try { statement.update(); }
        catch (DataIntegrityViolationException e) { throw error(HttpStatus.CONFLICT, "같은 원본 또는 같은 위키 제목이 이미 존재합니다."); }
        // Only a content change needs a source review; moving a wiki to another project or parent does not.
        boolean contentChanged = values.containsKey("title") && !values.get("title").equals(before.title())
                || values.containsKey("body") && !values.get("body").equals(before.body());
        if ("wiki".equals(before.pageType()) && contentChanged) jdbc.sql("UPDATE item_links SET target_revision = 0 WHERE from_id = :id AND relation = 'source'").param("id", id).update();
        snapshot(id); Item item = get(id).orElseThrow(); mentions(item); return Optional.of(item);
    }

    public List<Revision> history(long id) {
        if (get(id).isEmpty()) throw error(HttpStatus.NOT_FOUND, "문서가 없습니다.");
        return jdbc.sql("""
                SELECT item_id, revision, snapshot->>'title' AS title, snapshot->>'body' AS body,
                       snapshot->>'agent_body' AS agent_body, snapshot->>'status' AS status,
                       snapshot->>'prio' AS prio, snapshot->>'source_url' AS source_url, saved_at FROM item_revisions
                WHERE item_id = :id ORDER BY revision DESC""")
                .param("id", id).query(Revision.class).list();
    }
    @Transactional
    public Item restore(long id, int revision, Integer expected) {
        Item current = lock(id); version(current, expected);
        var saved = jdbc.sql("""
                SELECT snapshot->>'title' AS title, snapshot->>'body' AS body, snapshot->>'agent_body' AS agent_body,
                       snapshot->>'status' AS status, snapshot->>'prio' AS prio, snapshot->>'source_url' AS source_url
                FROM item_revisions WHERE item_id = :id AND revision = :v""")
                .param("id", id).param("v", revision).query((rs, row) -> {
                    var result = new HashMap<String, Object>();
                    for (String field : List.of("title", "body", "agent_body", "status", "prio", "source_url")) result.put(field, rs.getString(field));
                    return result;
                }).optional()
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "해당 버전이 없습니다."));
        var fields = new HashMap<String, Object>();
        for (String field : List.of("title", "body", "agent_body")) fields.put(field, saved.get(field));
        if ("issue".equals(current.kind())) { fields.put("status", saved.get("status")); fields.put("prio", saved.get("prio")); }
        if ("source".equals(current.pageType())) fields.put("source_url", saved.get("source_url"));
        fields.put("expected_revision", expected); update(id, fields);
        // ponytail: restore content, not historical link graphs; restored wiki content requires a new source review.
        if ("wiki".equals(current.pageType())) jdbc.sql("UPDATE item_links SET target_revision = 0 WHERE from_id = :id AND relation = 'source'").param("id", id).update();
        event(id, null, "restore", "버전 " + revision + "의 내용을 복원"); return get(id).orElseThrow();
    }

    @Transactional
    public Item publish(Long id, Integer expected, String title, String body, List<SourceRef> sources, List<Long> relatedIds, String summary, String project) {
        require(sources != null && !sources.isEmpty() && sources.size() <= 100, "원본 자료와 읽은 버전이 1~100개 필요합니다.");
        require(sources.stream().allMatch(s -> s != null && s.id() > 0 && s.revision() > 0), "출처 번호와 버전은 양의 정수여야 합니다.");
        require(summary != null && !summary.isBlank() && summary.length() <= 1000, "변경 요약을 1~1000자로 적어 주세요.");
        if (id != null) { Item target = lock(id); require("wiki".equals(target.pageType()), "지식 위키만 발행할 수 있습니다."); version(target, expected); }
        var originals = new ArrayList<Item>();
        for (SourceRef source : sources.stream().sorted(Comparator.comparingLong(SourceRef::id)).toList()) {
            Item original = lock(source.id()); require("source".equals(original.pageType()), "출처는 원본 자료여야 합니다.");
            version(original, source.revision()); originals.add(original);
        }
        var changes = new HashMap<String, Object>(Map.of("title", title(title), "body", text(body), "expected_revision", expected == null ? 0 : expected));
        if (project != null) changes.put("project", project);  // omitted: an existing wiki keeps its project
        Item wiki = id == null ? create("page", title, body, "", null, null, null, "wiki", null, project)
                : update(id, changes).orElseThrow();
        jdbc.sql("DELETE FROM item_links WHERE from_id = :id AND relation IN ('source','related')").param("id", wiki.id()).update();
        for (Item original : originals) { link(wiki.id(), original.id(), "source", original.revision()); event(wiki.id(), original.id(), "compile", summary); }
        if (relatedIds != null) {
            require(relatedIds.size() <= 100, "관련 문서는 100개 이하로 지정해 주세요.");
            require(relatedIds.stream().allMatch(r -> r != null && r > 0), "관련 문서 번호를 확인해 주세요.");
            for (long related : relatedIds) {
                require(related != wiki.id(), "자기 자신을 관련 문서로 지정할 수 없습니다.");
                Item target = get(related).orElseThrow(() -> error(HttpStatus.BAD_REQUEST, "관련 문서가 없습니다."));
                link(wiki.id(), target.id(), "related", target.revision());
            }
        }
        return get(wiki.id()).orElseThrow();
    }

    @Transactional
    public Item promote(long issueId, Integer expected) {
        Item issue = lock(issueId); version(issue, expected);
        require("issue".equals(issue.kind()) && "done".equals(issue.status()), "완료된 이슈만 지식으로 남길 수 있습니다.");
        var existing = jdbc.sql("SELECT from_id FROM item_links WHERE to_id = :id AND relation = 'issue' LIMIT 1")
                .param("id", issueId).query(Long.class).optional();
        if (existing.isPresent()) return get(existing.get()).orElseThrow();
        String record = "# QK-" + issue.id() + " · " + issue.title() + "\n\n## 사람용 요약\n" + issue.body()
                + "\n\n## 작업 기록\n" + issue.agentBody() + "\n\n원본 이슈: [QK-" + issue.id() + "](#issue/" + issue.id() + "), 버전 " + issue.revision();
        Item source = ingest("QK-" + issue.id() + " 작업 결과", record, null, issue.project()).item();
        String wikiTitle = "QK-" + issue.id() + " · " + issue.title();
        Item wiki = publish(null, null, wikiTitle.substring(0, Math.min(300, wikiTitle.length())), record,
                List.of(new SourceRef(source.id(), source.revision())), List.of(), "완료 이슈의 기록을 원문 그대로 보존 (LLM 요약 아님)", issue.project());
        link(wiki.id(), issue.id(), "issue", issue.revision()); event(wiki.id(), source.id(), "promote", "완료 이슈 QK-" + issue.id() + " 지식화"); return wiki;
    }

    public List<Link> links(long id, boolean incoming) {
        String join = incoming ? "i.id = l.from_id" : "i.id = l.to_id";
        String where = incoming ? "l.to_id = :id" : "l.from_id = :id";
        return jdbc.sql("SELECT i.id,i.title,i.kind,i.page_type,i.revision,l.target_revision AS linked_revision,l.relation FROM item_links l JOIN items i ON " + join + " WHERE " + where + " ORDER BY i.title")
                .param("id", id).query(Link.class).list();
    }
    public List<Event> events() {
        return jdbc.sql("SELECT e.*, i.title FROM wiki_events e LEFT JOIN items i ON i.id = e.item_id ORDER BY e.id DESC LIMIT 100").query(Event.class).list();
    }
    public List<Finding> check() {
        var items = list(null); Set<Long> ids = items.stream().map(Item::id).collect(Collectors.toSet());
        var results = new ArrayList<Finding>();
        for (Item item : items) {
            if ("wiki".equals(item.pageType())) {
                if (item.needsReview()) results.add(new Finding("review", item.id(), item.title(), "출처가 없거나 원본 버전이 달라 재정리가 필요합니다."));
                if (links(item.id(), true).isEmpty()) results.add(new Finding("orphan", item.id(), item.title(), "다른 문서의 연결이 없습니다."));
            }
            var matcher = MENTION.matcher(item.body() + "\n" + item.agentBody());
            while (matcher.find()) {
                try { if (!ids.contains(Long.parseLong(matcher.group(1)))) results.add(new Finding("broken_link", item.id(), item.title(), "없는 문서 링크: " + matcher.group())); }
                catch (NumberFormatException e) { results.add(new Finding("broken_link", item.id(), item.title(), "유효하지 않은 문서 번호")); }
            }
        }
        return results;
    }

    @Transactional
    public void delete(long id) {
        if (get(id).isEmpty()) return; // Repeated cleanup/deletion stays idempotent.
        lock(id);
        boolean referenced = jdbc.sql("""
                WITH RECURSIVE family AS (SELECT id FROM items WHERE id = :id
                  UNION SELECT i.id FROM items i JOIN family f ON i.parent_id = f.id)
                SELECT EXISTS(SELECT 1 FROM item_links l WHERE l.to_id IN (SELECT id FROM family)
                  AND l.from_id NOT IN (SELECT id FROM family) AND l.relation = 'source')""")
                .param("id", id).query(Boolean.class).single();
        if (referenced) throw error(HttpStatus.CONFLICT, "지식 위키가 인용하는 원본입니다. 먼저 위키의 출처를 정리해 주세요.");
        jdbc.sql("""
                WITH RECURSIVE family AS (SELECT id FROM items WHERE id = :id
                  UNION SELECT i.id FROM items i JOIN family f ON i.parent_id = f.id)
                DELETE FROM wiki_events WHERE item_id IN (SELECT id FROM family)""")
                .param("id", id).update();
        jdbc.sql("DELETE FROM items WHERE id = :id").param("id", id).update();
    }

    public List<Hit> search(String query, String kind, int limit, String pageType, String project) {
        String projectFilter = project == null || project.isBlank() ? null : project(project);
        String[] words = Arrays.stream((query == null ? "" : query).trim().split("\\s+")).filter(t -> !t.isEmpty()).distinct().toArray(String[]::new);
        require(words.length <= 20, "검색어는 20개 이하로 입력해 주세요.");
        String patterns = Arrays.stream(words).map(t -> "%" + t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%").collect(Collectors.joining("\n"));
        // ponytail: keyword scans suit this local corpus; measure real query failures before adding embeddings.
        var rows = jdbc.sql("""
                WITH t AS (SELECT unnest(string_to_array(:t, chr(10))) AS p), hits AS (
                  SELECT i.*,
                    (SELECT count(*) FROM t WHERE i.title ILIKE t.p) AS title_hits,
                    (SELECT count(*) FROM t WHERE i.body ILIKE t.p) AS body_hits,
                    (SELECT count(*) FROM t WHERE i.agent_body ILIKE t.p) AS agent_hits,
                """ + REVIEW + """
                    AS needs_review FROM items i
                  WHERE (CAST(:k AS text) IS NULL OR i.kind = :k) AND (CAST(:role AS text) IS NULL OR i.page_type = :role)
                    AND (CAST(:proj AS text) IS NULL OR i.project = :proj)
                )
                SELECT id,kind,title,status, CASE WHEN body_hits = 0 AND agent_hits > 0 THEN agent_body ELSE body END AS text,
                  CASE WHEN body_hits > 0 THEN 'body' WHEN agent_hits > 0 THEN 'agent_body' ELSE 'title' END AS source,
                  CASE WHEN kind = 'issue' THEN '#issue/' ELSE '#docs/' END || id
                    || CASE WHEN kind = 'issue' AND body_hits = 0 AND agent_hits > 0 THEN '/agent' ELSE '' END AS url,
                  updated_at, title_hits * 2 + body_hits + agent_hits AS score, page_type,needs_review,project
                FROM hits WHERE title_hits + body_hits + agent_hits > 0 ORDER BY score DESC,updated_at DESC LIMIT :n""")
                .param("t", patterns.isEmpty() ? "%" : patterns).param("k", kind).param("role", pageType).param("proj", projectFilter)
                .param("n", Math.max(1, Math.min(limit, 20))).query(Candidate.class).list();
        return rows.stream().map(row -> {
            String body = row.text();
            int match = Arrays.stream(words).mapToInt(w -> body.toLowerCase(Locale.ROOT).indexOf(w.toLowerCase(Locale.ROOT))).filter(p -> p >= 0).min().orElse(0);
            int start = Math.max(0, match - 70), end = Math.min(body.length(), start + 300);
            if (start > 0 && Character.isLowSurrogate(body.charAt(start))) start--;
            if (end < body.length() && end > 0 && Character.isHighSurrogate(body.charAt(end - 1))) end--;
            String snippet = (start > 0 ? "…" : "") + body.substring(start, end) + (end < body.length() ? "…" : "");
            String heading = ""; var headings = Pattern.compile("(?m)^#{1,6} (.+)$").matcher(body);
            while (headings.find() && headings.start() <= match) heading = headings.group(1);
            return new Hit(row.id(),row.kind(),row.title(),row.status(),snippet,row.source(),row.url(),row.updatedAt(),row.score(),start,heading,row.pageType(),row.needsReview(),row.project());
        }).toList();
    }
}
