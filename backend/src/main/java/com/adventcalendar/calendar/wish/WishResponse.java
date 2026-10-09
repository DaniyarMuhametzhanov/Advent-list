package com.adventcalendar.calendar.wish;

import java.time.LocalDate;

public record WishResponse(
        Long id,
        LocalDate date,
        String title,
        String comment
) {

    public static WishResponse from(Wish wish) {
        return new WishResponse(wish.getId(), wish.getDate(), wish.getTitle(), wish.getComment());
    }
}