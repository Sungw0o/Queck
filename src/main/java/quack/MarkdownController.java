package quack;

import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class MarkdownController {
    private final ItemRepository repo;
    MarkdownController(ItemRepository repo) { this.repo = repo; }
    record Import(String markdown, String title, String pageType, String sourceUrl, String project) {}

    @PostMapping("/markdown/import")
    Object importMarkdown(@RequestBody Import input) {
        String body = input.markdown() == null ? "" : input.markdown();
        String title = input.title();
        if (title == null || title.isBlank()) title = body.lines().filter(l -> l.startsWith("# ")).map(l -> l.substring(2)).findFirst().orElse("가져온 문서");
        if ("source".equals(input.pageType())) return repo.ingest(title, body, input.sourceUrl(), input.project());
        return repo.create("page", title, body, "", null, null, null, "note", null, input.project());
    }

    private String markdown(ItemRepository.Item i) {
        String body = "# " + i.title() + "\n\n> Quack #" + i.id() + " · " + i.pageType() + " · 버전 " + i.revision() + (i.project().isEmpty() ? "" : " · 프로젝트 " + i.project()) + "\n\n";
        if (i.sourceUrl() != null) body += "출처: " + i.sourceUrl() + "\n\n";
        if ("issue".equals(i.kind())) body += "## 사람용 요약\n\n" + i.body() + "\n\n## 에이전트 문서\n\n" + i.agentBody();
        else body += i.body();
        for (var link : repo.links(i.id(), false)) body += "\n\n- " + link.relation() + ": [" + link.title().replace("[", "\\[").replace("]", "\\]") + "](#" + ("issue".equals(link.kind()) ? "issue/" : "docs/") + link.id() + ") · 인용 버전 " + link.linkedRevision();
        return body + "\n";
    }
    @GetMapping("/items/{id}/export")
    ResponseEntity<byte[]> export(@PathVariable long id) {
        var item = repo.get(id).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=quack-" + id + ".md")
                .contentType(MediaType.parseMediaType("text/markdown; charset=UTF-8")).body(markdown(item).getBytes(StandardCharsets.UTF_8));
    }
    @GetMapping("/export")
    ResponseEntity<byte[]> exportAll() throws java.io.IOException {
        // ponytail: Markdown export is portable content, not a DB backup or a round-trip archive.
        var output = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            for (var item : repo.list(null)) {
                zip.putNextEntry(new ZipEntry(item.id() + ".md"));
                zip.write(markdown(item).replaceAll("#(?:docs|issue)/(\\d+)(?:/agent)?", "$1.md").getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=quack-markdown.zip")
                .contentType(MediaType.APPLICATION_OCTET_STREAM).body(output.toByteArray());
    }
}
