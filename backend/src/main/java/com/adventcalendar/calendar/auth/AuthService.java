package com.adventcalendar.calendar.auth;

import com.adventcalendar.calendar.consent.ConsentService;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ConsentService consentService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                       ConsentService consentService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.consentService = consentService;
    }

    @Transactional
    public void register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new EmailTakenException();
        }
        String hash = passwordEncoder.encode(request.password()); // сам пароль не храним, только хеш
        User user = userRepository.save(new User(request.name().trim(), email, hash));
        consentService.recordSignUpConsents(user); // запоминаем: с чем согласился и когда
    }

    // «Anna@Example.com » и «anna@example.com» — один и тот же человек
    public static String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }
}