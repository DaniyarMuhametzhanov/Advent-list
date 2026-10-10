package com.adventcalendar.calendar.auth;

import com.adventcalendar.calendar.security.CurrentUser;

// Что фронтенд узнаёт о вошедшем человеке. Пароля (и его хеша) здесь нет!
public record MeResponse(Long id, String name, String email) {

    public static MeResponse from(CurrentUser user) {
        return new MeResponse(user.id(), user.name(), user.email());
    }
}