package com.adventcalendar.calendar.wish;

public class WishNotFoundException extends RuntimeException {

    public WishNotFoundException(Long id) {
        super("Желание с id " + id + " не найдено");
    }
}