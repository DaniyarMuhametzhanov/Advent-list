package com.adventcalendar.calendar.wish;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Repository;

@Repository
public class WishRepository {

    private final Map<Long, Wish> wishes = new ConcurrentHashMap<>();
    private final AtomicLong nextId = new AtomicLong(1);

    public List<Wish> findAll() {
        return wishes.values().stream()
                .sorted(Comparator.comparing(Wish::date))
                .toList();
    }

    public Optional<Wish> findById(Long id) {
        return Optional.ofNullable(wishes.get(id));
    }

    public Optional<Wish> findByDate(LocalDate date) {
        return wishes.values().stream()
                .filter(wish -> wish.date().equals(date))
                .findFirst();
    }

    public Wish save(Wish wish) {
        Wish toSave = wish.id() == null ? wish.withId(nextId.getAndIncrement()) : wish;
        wishes.put(toSave.id(), toSave);
        return toSave;
    }

    public boolean deleteById(Long id) {
        return wishes.remove(id) != null;
    }
}