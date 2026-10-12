package com.adventcalendar.calendar.holiday;

// Такого дня в году нет, например 31 апреля или 13-й месяц
public class BadHolidayDateException extends RuntimeException {

    public BadHolidayDateException(int month, int day) {
        super("Такого дня нет: " + day + "." + month);
    }
}
