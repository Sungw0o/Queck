package quack;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ItemRepository {

    public record Item(long id, String kind, String title, String body, String agentBody, String status, String prio,
                       Long parentId, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}

    public record Hit(long id, String kind, String title, String status, String snippet, String source, String url,
                      OffsetDateTime updatedAt, long score) {}

    private static final Set<String> FIELDS = Set.of("kind", "title", "body", "agent_body", "status", "prio", "parent_id");

    private final JdbcClient jdbc;

    ItemRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<Item> list(String kind) {
        return jdbc.sql("SELECT * FROM items WHERE CAST(:k AS text) IS NULL OR kind = :k ORDER BY updated_at")
                .param("k", kind)
                .query(Item.class).list();
    }

    public Optional<Item> get(long id) {
        return jdbc.sql("SELECT * FROM items WHERE id = :id").param("id", id).query(Item.class).optional();
    }

    public Item create(String kind, String title, String body, String agentBody, String status, String prio, Long parentId) {
        if ("issue".equals(kind)) {
            status = status != null ? status : "todo";
            prio = prio != null ? prio : "mid";
        }
        return jdbc.sql("""
                        INSERT INTO items (kind, title, body, agent_body, status, prio, parent_id)
                        VALUES (:kind, :title, :body, :agentBody, :status, :prio, :parentId) RETURNING *""")
                .param("kind", kind).param("title", title).param("body", body != null ? body : "")
                .param("agentBody", agentBody != null ? agentBody : "")
                .param("status", status).param("prio", prio).param("parentId", parentId)
                .query(Item.class).single();
    }

    /** Partial update: only keys present in {@code fields} change, so an explicit null clears a column. */
    public Optional<Item> update(long id, Map<String, Object> fields) {
        var keys = fields.keySet().stream().filter(FIELDS::contains).toList();
        if (keys.isEmpty()) return get(id);
        var sets = keys.stream().map(k -> k + " = :" + k).collect(Collectors.joining(", "));
        var spec = jdbc.sql("UPDATE items SET " + sets + ", updated_at = now() WHERE id = :id RETURNING *").param("id", id);
        for (var k : keys) spec = spec.param(k, "agent_body".equals(k) && fields.get(k) == null ? "" : fields.get(k));
        return spec.query(Item.class).optional();
    }

    public void delete(long id) {
        jdbc.sql("DELETE FROM items WHERE id = :id").param("id", id).update();
    }

    public List<Hit> search(String query, String kind, int limit) {
        var terms = Arrays.stream(query.trim().split("\\s+"))
                .filter(t -> !t.isEmpty())
                .map(t -> "%" + t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
                .collect(Collectors.joining("\n"));
        // ponytail: substring match + hit count over a seq scan; fine for a personal corpus,
        // add pg_trgm or pgvector embeddings when it gets slow or misses too much
        return jdbc.sql("""
                        WITH t AS (SELECT unnest(string_to_array(:t, chr(10))) AS p),
                        hits AS (
                            SELECT i.*,
                                (SELECT count(*) FROM t WHERE i.title ILIKE t.p) AS title_hits,
                                (SELECT count(*) FROM t WHERE i.body ILIKE t.p) AS body_hits,
                                (SELECT count(*) FROM t WHERE i.agent_body ILIKE t.p) AS agent_hits
                            FROM items i WHERE CAST(:k AS text) IS NULL OR i.kind = :k
                        )
                        SELECT id, kind, title, status,
                            left(CASE WHEN body_hits = 0 AND agent_hits > 0 THEN agent_body ELSE body END, 300) AS snippet,
                            CASE WHEN body_hits > 0 THEN 'body' WHEN agent_hits > 0 THEN 'agent_body' ELSE 'title' END AS source,
                            CASE WHEN kind = 'issue' THEN '#issue/' ELSE '#docs/' END || id
                                || CASE WHEN kind = 'issue' AND body_hits = 0 AND agent_hits > 0 THEN '/agent' ELSE '' END AS url,
                            updated_at, title_hits * 2 + body_hits + agent_hits AS score
                        FROM hits WHERE title_hits + body_hits + agent_hits > 0
                        ORDER BY score DESC, updated_at DESC
                        LIMIT :n""")
                .param("t", terms.isEmpty() ? "%" : terms).param("k", kind).param("n", Math.max(1, Math.min(limit, 20)))
                .query(Hit.class).list();
    }
}
