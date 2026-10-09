package com.adventcalendar.calendar.wish;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WishRequest(
        @NotBlank(message = "Название обязательно")
        @Size(max = 100, message = "Название не длиннее 100 символов")
        String title,

        @Size(max = 1000, message = "Комментарий не длиннее 1000 символов")
        String comment
) {
}