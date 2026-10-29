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

    record NewItem(String kind, String title, String body, String agentBody, String status, String prio, Long parentId) {}

    private final ItemRepository repo;

    ItemController(ItemRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/items")
    List<Item> list(@RequestParam(required = false) String kind) {
        return repo.list(kind);
    }

    @GetMapping("/search")
    List<Hit> search(@RequestParam(defaultValue = "") String q, @RequestParam(required = false) String kind) {
        return repo.search(q, kind, 20);
    }

    @GetMapping("/items/{id}")
    Item get(@PathVariable long id) {
        return repo.get(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PostMapping("/items")
    Item create(@RequestBody NewItem i) {
        return repo.create(i.kind(), i.title(), i.body(), i.agentBody(), i.status(), i.prio(), i.parentId());
    }

    @PatchMapping("/items/{id}")
    Item update(@PathVariable long id, @RequestBody Map<String, Object> fields) {
        return repo.update(id, fields).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @DeleteMapping("/items/{id}")
    void delete(@PathVariable long id) {
        repo.delete(id);
    }
}
