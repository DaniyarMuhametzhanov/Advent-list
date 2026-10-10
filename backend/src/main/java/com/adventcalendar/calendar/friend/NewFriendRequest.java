package com.adventcalendar.calendar.friend;

import jakarta.validation.constraints.NotNull;

public record NewFriendRequest(
        @NotNull(message = "Укажите, кому отправить заявку")
        Long toUserId
) {
}