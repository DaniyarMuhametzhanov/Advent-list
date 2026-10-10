package com.adventcalendar.calendar.auth;

import com.adventcalendar.calendar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final AuthService authService;
    private final AuthenticationManager authenticationManager;
    // Умеет сохранить «кто вошёл» в сессию, чтобы следующие запросы это знали
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(AuthService authService, AuthenticationManager authenticationManager) {
        this.authService = authService;
        this.authenticationManager = authenticationManager;
    }

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public MeResponse register(@Valid @RequestBody RegisterRequest body,
                               HttpServletRequest request, HttpServletResponse response) {
        authService.register(body);
        return signIn(body.email(), body.password(), request, response); // после регистрации сразу входим
    }

    @PostMapping("/auth/login")
    public MeResponse login(@Valid @RequestBody LoginRequest body,
                            HttpServletRequest request, HttpServletResponse response) {
        return signIn(body.email(), body.password(), request, response);
    }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal CurrentUser me) {
        return MeResponse.from(me);
    }

    private MeResponse signIn(String email, String password,
                              HttpServletRequest request, HttpServletResponse response) {
        // 1. Проверить email и пароль. Если неверно — вылетит BadCredentialsException
        Authentication auth = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(AuthService.normalizeEmail(email), password));

        // 2. Выдать новый номер сессии (защита от «фиксации сессии»)
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }

        // 3. Запомнить в сессии, кто вошёл
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);

        return MeResponse.from((CurrentUser) auth.getPrincipal());
    }
}