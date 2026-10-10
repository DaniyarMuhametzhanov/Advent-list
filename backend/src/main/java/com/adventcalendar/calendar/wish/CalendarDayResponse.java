package com.adventcalendar.calendar.wish;

import java.time.LocalDate;

// Один занятый день в календаре. Если open = false, название и комментарий не отдаём (null)
public record CalendarDayResponse(Long wishId, LocalDate date, boolean open, String title, String comment) {

    public static CalendarDayResponse open(Wish wish) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), true, wish.getTitle(), wish.getComment());
    }

    public static CalendarDayResponse closed(Wish wish) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), false, null, null);
    }
}