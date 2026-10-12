package com.adventcalendar.calendar.holiday;

// Праздник для фронтенда: id (чтобы переименовать или удалить), месяц (1–12), число и название
public record HolidayResponse(Long id, int month, int day, String title) {

    public static HolidayResponse from(Holiday holiday) {
        return new HolidayResponse(holiday.getId(), holiday.getDate().getMonthValue(),
                holiday.getDate().getDayOfMonth(), holiday.getTitle());
    }
}
