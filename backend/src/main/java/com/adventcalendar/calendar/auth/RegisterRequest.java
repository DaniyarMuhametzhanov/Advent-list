package com.adventcalendar.calendar.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "Имя обязательно")
        @Size(max = 100, message = "Имя не длиннее 100 символов")
        String name,

        @NotBlank(message = "Email обязателен")
        @Email(message = "Это не похоже на email")
        @Size(max = 255, message = "Email слишком длинный")
        String email,

        @NotBlank(message = "Пароль обязателен")
        @Size(min = 8, max = 72, message = "Пароль от 8 до 72 символов")
        String password
) {
}