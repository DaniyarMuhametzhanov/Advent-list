package com.adventcalendar.calendar.holiday;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record HolidayRequest(
        @NotBlank(message = "Введите название праздника")
        @Size(max = 40, message = "Название праздника не длиннее 40 символов")
        String title
) {
}
