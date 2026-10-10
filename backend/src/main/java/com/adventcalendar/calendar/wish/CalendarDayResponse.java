package com.adventcalendar.calendar.wish;

import java.time.LocalDate;

// Один занятый день в календаре. Если open = false, название и комментарий не отдаём (null).
// requested = true: я уже попросил доступ к этому дню и жду ответа
public record CalendarDayResponse(Long wishId, LocalDate date, boolean open, boolean requested,
                                  String title, String comment) {

    public static CalendarDayResponse open(Wish wish) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), true, false, wish.getTitle(), wish.getComment());
    }

    public static CalendarDayResponse closed(Wish wish, boolean requested) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), false, requested, null, null);
    }
}
