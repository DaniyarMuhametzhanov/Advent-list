package com.adventcalendar.calendar.access;

public class AccessRequestNotFoundException extends RuntimeException {

    public AccessRequestNotFoundException(Long id) {
        super("Запрос доступа с id " + id + " не найден");
    }
}
