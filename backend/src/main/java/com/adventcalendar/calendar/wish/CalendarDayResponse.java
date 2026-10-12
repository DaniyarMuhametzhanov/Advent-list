package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.image.ImageUrls;
import java.io.Serializable;
import java.time.LocalDate;
import java.util.List;

// Один занятый день в календаре. Если open = false, название, комментарий и адреса картинки не отдаём (null).
// requested = true: я уже попросил доступ к этому дню и жду ответа.
// holidays — свои праздники владельца в этот день (дни рождения и т. п.). У закрытого дня — пустой список
public record CalendarDayResponse(Long wishId, LocalDate date, boolean open, boolean requested,
                                  String title, String comment, String imageUrl, String thumbUrl,
                                  List<String> holidays) implements Serializable {

    public static CalendarDayResponse open(Wish wish, List<String> holidays) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), true, false, wish.getTitle(), wish.getComment(),
                ImageUrls.full(wish), ImageUrls.thumb(wish), holidays);
    }

    // Тот же день, но закрытый: оставляем только id и дату, всё остальное стираем
    public CalendarDayResponse closed(boolean requested) {
        return new CalendarDayResponse(wishId, date, false, requested, null, null, null, null, List.of());
    }
}
