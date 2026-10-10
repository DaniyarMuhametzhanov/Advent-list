package com.adventcalendar.calendar.image;

// Файл не подходит: не картинка, слишком большой, пустой. Ответ 400
public class BadImageException extends RuntimeException {

    public BadImageException(String message) {
        super(message);
    }
}
