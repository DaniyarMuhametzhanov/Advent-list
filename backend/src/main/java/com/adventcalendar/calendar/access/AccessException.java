package com.adventcalendar.calendar.access;

// Действие с доступом противоречит текущему состоянию: уже открыт, уже просили и т. п. Сервер ответит 409
public class AccessException extends RuntimeException {

    public AccessException(String message) {
        super(message);
    }
}
