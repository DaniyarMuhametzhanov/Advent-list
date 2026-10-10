package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.friend.FriendResponse;
import java.time.LocalDate;

// Запрос доступа к моему дню: кто просит и к какому желанию
public record AccessRequestResponse(Long id, Long wishId, LocalDate date, String title, FriendResponse from) {

    public static AccessRequestResponse from(AccessRequest request) {
        return new AccessRequestResponse(
                request.getId(),
                request.getWish().getId(),
                request.getWish().getDate(),
                request.getWish().getTitle(), // это моё желание, его название мне показывать можно
                FriendResponse.from(request.getFromUser()));
    }
}
