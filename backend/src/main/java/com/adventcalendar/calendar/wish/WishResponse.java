package com.adventcalendar.calendar.wish;

import java.time.LocalDate;
import java.util.List;

public record WishResponse(
        Long id,
        LocalDate date,
        String title,
        String comment,
        List<Long> access // id друзей, которым открыт этот день. Это видит только владелец
) {

    public static WishResponse from(Wish wish, List<Long> access) {
        return new WishResponse(wish.getId(), wish.getDate(), wish.getTitle(), wish.getComment(), access);
    }
}
