package com.adventcalendar.calendar.security;

import java.time.Duration;

// Слишком много попыток входа. retryAfter — через сколько можно пробовать снова
public class TooManyAttemptsException extends RuntimeException {

    private final Duration retryAfter;

    public TooManyAttemptsException(Duration retryAfter) {
        super("Слишком много попыток входа");
        this.retryAfter = retryAfter;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
