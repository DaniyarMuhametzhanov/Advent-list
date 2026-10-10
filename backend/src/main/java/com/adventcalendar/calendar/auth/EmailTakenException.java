package com.adventcalendar.calendar.auth;

public class EmailTakenException extends RuntimeException {

    public EmailTakenException() {
        super("Этот email уже зарегистрирован");
    }
}