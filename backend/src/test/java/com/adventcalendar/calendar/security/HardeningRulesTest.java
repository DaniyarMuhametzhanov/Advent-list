package com.adventcalendar.calendar.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

// Защита перед публикацией: лимит попыток входа, защитные заголовки, ошибки без подробностей.
// Счётчики попыток живут в Redis и НЕ откатываются после теста, поэтому у каждого теста
// свой адрес (IP) и свой email — тесты друг другу не мешают
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@Transactional
class HardeningRulesTest {

    @Autowired MockMvc mvc;

    private ResultActions login(String ip, String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf())
                .with(request -> { request.setRemoteAddr(ip); return request; }) // «запрос пришёл с этого адреса»
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"" + email + "\", \"password\": \"" + password + "\"}"));
    }

    private void register(String ip, String email) throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                        .with(request -> { request.setRemoteAddr(ip); return request; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Тест", "email": "%s", "password": "password123",
                                 "privacyAccepted": true, "termsAccepted": true}
                                """.formatted(email)))
                .andExpect(status().isCreated());
    }

    @Test
    void fiveWrongPasswordsBlockThisEmail() throws Exception {
        register("10.0.0.1", "lock@test.local");

        for (int i = 0; i < 5; i++) {
            login("10.0.0.1", "lock@test.local", "wrong").andExpect(status().isUnauthorized());
        }
        // Шестая попытка — даже с ВЕРНЫМ паролем — отказ: email заблокирован на время
        login("10.0.0.1", "lock@test.local", "password123")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("Слишком много попыток")));
    }

    @Test
    void successfulLoginResetsMistakes() throws Exception {
        register("10.0.0.2", "reset@test.local");

        for (int i = 0; i < 4; i++) {
            login("10.0.0.2", "reset@test.local", "wrong").andExpect(status().isUnauthorized());
        }
        login("10.0.0.2", "reset@test.local", "password123").andExpect(status().isOk());

        // Счётчик обнулился: снова можно ошибиться 4 раза, и это всё ещё 401, а не 429
        for (int i = 0; i < 4; i++) {
            login("10.0.0.2", "reset@test.local", "wrong").andExpect(status().isUnauthorized());
        }
    }

    @Test
    void tooManyAttemptsFromOneAddressAreBlocked() throws Exception {
        // С одного адреса перебирают разные email: лимит на email не сработает, а лимит на адрес — да
        for (int i = 0; i < 50; i++) {
            login("10.0.0.3", "user" + i + "@test.local", "wrong").andExpect(status().isUnauthorized());
        }
        login("10.0.0.3", "one-more@test.local", "wrong").andExpect(status().isTooManyRequests());

        // С другого адреса вход работает как обычно
        login("10.0.0.4", "one-more@test.local", "wrong").andExpect(status().isUnauthorized());
    }

    @Test
    void securityHeadersArePresent() throws Exception {
        mvc.perform(get("/api/health"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("Permissions-Policy", "camera=(), microphone=(), geolocation=()"));
    }

    @Test
    void unknownAddressIs404Not500(@Autowired UserRepository userRepository) throws Exception {
        User me = userRepository.save(new User("Я", "me404@test.local", "x"));

        // Новый обработчик «всех остальных ошибок» не должен превращать обычный 404 в 500
        mvc.perform(get("/api/no-such-address").with(user(CurrentUser.from(me))))
                .andExpect(status().isNotFound());
    }

    @Test
    void botThatFillsHoneypotIsNotRegistered(@Autowired UserRepository userRepository) throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                        .with(request -> { request.setRemoteAddr("10.0.0.5"); return request; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Бот", "email": "bot@test.local", "password": "password123",
                                 "privacyAccepted": true, "termsAccepted": true,
                                 "extraInfo": "http://spam.example"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Не получилось создать аккаунт"));

        org.assertj.core.api.Assertions.assertThat(userRepository.findByEmail("bot@test.local")).isEmpty();
    }
}
