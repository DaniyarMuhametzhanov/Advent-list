package com.adventcalendar.calendar.security;

import com.adventcalendar.calendar.user.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

// Spring Security спрашивает: «найди человека по логину». Логин у нас — email.
@Service
public class DbUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public DbUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) {
        return userRepository.findByEmail(email)
                .map(CurrentUser::from)
                .orElseThrow(() -> new UsernameNotFoundException("Пользователь не найден"));
    }
}