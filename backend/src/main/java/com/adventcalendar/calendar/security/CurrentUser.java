package com.adventcalendar.calendar.security;

import com.adventcalendar.calendar.user.User;
import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

// «Пропуск» вошедшего человека: Spring Security хранит его в сессии
public record CurrentUser(Long id, String name, String email, String passwordHash) implements UserDetails {

    public static CurrentUser from(User user) {
        return new CurrentUser(user.getId(), user.getName(), user.getEmail(), user.getPasswordHash());
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(); // ролей (админ и т. п.) у нас нет
    }
}