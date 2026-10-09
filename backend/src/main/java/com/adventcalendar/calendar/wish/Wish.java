package com.adventcalendar.calendar.wish;

import java.time.Instant;
import java.time.LocalDate;

public record Wish(
        Long id,
        LocalDate date,
        String title,
        String comment,
        Instant createdAt,
        Instant updatedAt
) {

    public Wish withId(Long newId) {
        return new Wish(newId, date, title, comment, createdAt, updatedAt);
    }
}