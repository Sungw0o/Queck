package quack;

import java.util.List;
import java.util.Map;

import quack.ItemRepository.Hit;
import quack.ItemRepository.Item;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
class ItemController {

    record NewItem(String kind, String title, String body, String agentBody, String status, String prio, Long parentId, String pageType, String sourceUrl) {}
    record Source(String title, String body, String sourceUrl) {}
    record Restore(int revision, Integer expectedRevision) {}
    record Expected(Integer expectedRevision) {}
    record Publish(Long id, Integer expectedRevision, String title, String body, List<ItemRepository.SourceRef> sources, List<Long> relatedIds, String summary) {}

    private final ItemRepository repo;

    ItemController(ItemRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/items")
    List<Item> list(@RequestParam(required = false) String kind) {
        return repo.list(kind);
    }

    @GetMapping("/search")
    List<Hit> search(@RequestParam(defaultValue = "") String q, @RequestParam(required = false) String kind, @RequestParam(required = false) String page_type) {
        return repo.search(q, kind, 20, page_type);
    }

    @GetMapping("/items/{id}")
    Item get(@PathVariable long id) {
        return repo.get(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PostMapping("/items")
    Item create(@RequestBody NewItem i) {
        return repo.create(i.kind(), i.title(), i.body(), i.agentBody(), i.status(), i.prio(), i.parentId(), i.pageType(), i.sourceUrl());
    }

    @PatchMapping("/items/{id}")
    Item update(@PathVariable long id, @RequestBody Map<String, Object> fields) {
        return repo.update(id, fields).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @DeleteMapping("/items/{id}")
    void delete(@PathVariable long id) {
        repo.delete(id);
    }

    @GetMapping("/items/{id}/history")
    Object history(@PathVariable long id) { return repo.history(id); }
    @PostMapping("/items/{id}/restore")
    Item restore(@PathVariable long id, @RequestBody Restore r) { return repo.restore(id, r.revision(), r.expectedRevision()); }
    @GetMapping("/items/{id}/links")
    Object links(@PathVariable long id) { get(id); return Map.of("outgoing", repo.links(id, false), "backlinks", repo.links(id, true)); }
    @PostMapping("/sources")
    Object ingest(@RequestBody Source s) { return repo.ingest(s.title(), s.body(), s.sourceUrl()); }
    @PostMapping("/wiki/publish")
    Item publish(@RequestBody Publish p) { return repo.publish(p.id(), p.expectedRevision(), p.title(), p.body(), p.sources(), p.relatedIds(), p.summary()); }
    @GetMapping("/wiki/index")
    Object index() { return repo.list("page").stream().filter(i -> "wiki".equals(i.pageType())).toList(); }
    @GetMapping("/wiki/log")
    Object log() { return repo.events(); }
    @GetMapping("/wiki/check")
    Object check() { return repo.check(); }
    @PostMapping("/items/{id}/knowledge")
    Item promote(@PathVariable long id, @RequestBody Expected e) { return repo.promote(id, e.expectedRevision()); }
    @ExceptionHandler(ResponseStatusException.class)
    org.springframework.http.ResponseEntity<?> error(ResponseStatusException e) {
        return org.springframework.http.ResponseEntity.status(e.getStatusCode()).body(Map.of("message", e.getReason() == null ? "요청을 처리할 수 없습니다." : e.getReason()));
    }
}
