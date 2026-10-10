package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.image.ImageUrls;
import java.time.LocalDate;

// Один занятый день в календаре. Если open = false, название, комментарий и адреса картинки не отдаём (null).
// requested = true: я уже попросил доступ к этому дню и жду ответа
public record CalendarDayResponse(Long wishId, LocalDate date, boolean open, boolean requested,
                                  String title, String comment, String imageUrl, String thumbUrl) {

    public static CalendarDayResponse open(Wish wish) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), true, false, wish.getTitle(), wish.getComment(),
                ImageUrls.full(wish), ImageUrls.thumb(wish));
    }

    public static CalendarDayResponse closed(Wish wish, boolean requested) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), false, requested, null, null, null, null);
    }
}
