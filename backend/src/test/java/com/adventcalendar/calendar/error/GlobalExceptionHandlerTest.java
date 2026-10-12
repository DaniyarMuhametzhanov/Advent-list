package com.adventcalendar.calendar.error;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

// Юнит-тест: без Spring и без базы, просто вызываем метод обработчика
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void unexpectedErrorHidesDetails() {
        // Представим, что база упала с сообщением, в котором видно устройство сервера
        Exception ex = new IllegalStateException("could not execute SQL: SELECT password_hash FROM users");

        ResponseEntity<ProblemDetail> response = handler.handleUnexpected(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        String detail = response.getBody().getDetail();
        assertThat(detail).startsWith("Что-то пошло не так. Код ошибки: ");
        assertThat(detail).doesNotContain("SQL", "password_hash", "IllegalStateException");
    }

    @Test
    void knownSpringErrorKeepsItsStatus() {
        ResponseEntity<ProblemDetail> response = handler.handleUnexpected(new ResponseStatusException(HttpStatus.NOT_FOUND));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
