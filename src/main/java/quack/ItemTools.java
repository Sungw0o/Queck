package quack;

import java.util.HashMap;
import java.util.List;

import quack.ItemRepository.Hit;
import quack.ItemRepository.Item;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/** Tools exposed to Claude over MCP (POST /mcp). */
@Component
public class ItemTools {

    private final ItemRepository repo;

    ItemTools(ItemRepository repo) {
        this.repo = repo;
    }

    @Tool(description = """
            Search my issues and wiki pages. Substring match on space-separated terms, ranked by hits.
            Korean text: use short stems without particles ('로그인' not '로그인을') and try synonyms if results are thin.
            Empty query lists recent items. Returns snippets only; call get(id) for the full body. Issue QK-12 has id 12.""")
    public List<Hit> search(@ToolParam(description = "space-separated keywords") String query,
                            @ToolParam(required = false, description = "'issue' or 'page' to filter") String kind,
                            @ToolParam(required = false, description = "max results, default 10") Integer limit) {
        return repo.search(query, kind, limit != null ? limit : 10);
    }

    @Tool(description = "Get one issue or page with its full markdown body.")
    public Item get(long id) {
        return repo.get(id).orElse(null);
    }

    @Tool(description = """
            Create an item. kind: 'issue' or 'page'. body is markdown.
            Issues: status 'todo'|'doing'|'done' (default todo), prio 'high'|'mid'|'low' (default mid).
            Pages: parentId = id of the parent page to nest it, or omit for a top-level page.""")
    public Item create(String kind, String title,
                       @ToolParam(required = false) String body,
                       @ToolParam(required = false) String status,
                       @ToolParam(required = false) String prio,
                       @ToolParam(required = false) Long parentId) {
        return repo.create(kind, title, body, status, prio, parentId);
    }

    @Tool(description = "Update fields of an issue or page; omitted fields stay unchanged. body replaces the whole body.")
    public Item update(long id,
                       @ToolParam(required = false) String title,
                       @ToolParam(required = false) String body,
                       @ToolParam(required = false) String status,
                       @ToolParam(required = false) String prio) {
        var fields = new HashMap<String, Object>();
        if (title != null) fields.put("title", title);
        if (body != null) fields.put("body", body);
        if (status != null) fields.put("status", status);
        if (prio != null) fields.put("prio", prio);
        return repo.update(id, fields).orElse(null);
    }
}
