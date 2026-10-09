package com.adventcalendar.calendar.wish;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class WishService {

    private final WishRepository repository;

    public WishService(WishRepository repository) {
        this.repository = repository;
    }

    public List<WishResponse> findAll() {
        return repository.findAll().stream()
                .map(WishResponse::from)
                .toList();
    }

    public WishResponse findById(Long id) {
        return repository.findById(id)
                .map(WishResponse::from)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    public WishResponse saveForDate(LocalDate date, WishRequest request) {
        Instant now = Instant.now();
        Wish wish = repository.findByDate(date)
                .map(old -> new Wish(old.id(), date, request.title(), request.comment(), old.createdAt(), now))
                .orElseGet(() -> new Wish(null, date, request.title(), request.comment(), now, now));
        return WishResponse.from(repository.save(wish));
    }

    public void delete(Long id) {
        if (!repository.deleteById(id)) {
            throw new WishNotFoundException(id);
        }
    }
}