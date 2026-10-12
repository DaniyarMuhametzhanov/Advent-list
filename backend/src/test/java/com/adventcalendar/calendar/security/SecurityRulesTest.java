package com.adventcalendar.calendar.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.consent.Consent;
import com.adventcalendar.calendar.consent.ConsentRepository;
import com.adventcalendar.calendar.consent.ConsentType;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

// Вход, выход и защита адресов: кто куда может попасть
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@Transactional
class SecurityRulesTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired WishRepository wishRepository;
    @Autowired ConsentRepository consentRepository;

    private static final String NEW_USER = """
            {"name": "Гоша", "email": "Gosha@Test.local", "password": "password123",
             "privacyAccepted": true, "termsAccepted": true}
            """;

    @Test
    void healthIsOpenForEveryone() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk());
    }

    @Test
    void withoutLoginApiAnswers401() throws Exception {
        mvc.perform(get("/api/wishes")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/calendars/1?month=2030-01")).andExpect(status().isUnauthorized());
    }

    @Test
    void registerLogsInAndRemembersUser() throws Exception {
        MockHttpSession session = (MockHttpSession) mvc.perform(post("/api/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(NEW_USER))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("gosha@test.local")) // email привели к одному виду
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andReturn().getRequest().getSession(false);

        // Следующий запрос с той же сессией: сервер помнит, кто это
        mvc.perform(get("/api/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Гоша"));
    }

    @Test
    void registerRemembersConsentsWithDocumentVersion() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(NEW_USER))
                .andExpect(status().isCreated());

        Long userId = userRepository.findByEmail("gosha@test.local").orElseThrow().getId();
        List<Consent> consents = consentRepository.findAllByUserIdOrderByAcceptedAtAsc(userId);
        assertThat(consents).extracting(Consent::getType)
                .containsExactlyInAnyOrder(ConsentType.PRIVACY_POLICY, ConsentType.TERMS);
        assertThat(consents).allSatisfy(c -> {
            assertThat(c.getDocumentVersion()).isNotBlank();
            assertThat(c.getAcceptedAt()).isNotNull();
        });
    }

    @Test
    void registerWithoutConsentIsRejected() throws Exception {
        // Галочка согласия не отмечена — аккаунт не создаётся
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Гоша", "email": "gosha@test.local", "password": "password123",
                                 "privacyAccepted": false, "termsAccepted": true}
                                """))
                .andExpect(status().isBadRequest());
        // Галочек нет в запросе вовсе — тоже отказ
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Гоша", "email": "gosha@test.local", "password": "password123"}
                                """))
                .andExpect(status().isBadRequest());

        assertThat(userRepository.findByEmail("gosha@test.local")).isEmpty();
    }

    @Test
    void wrongPasswordGives401() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(NEW_USER));

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "gosha@test.local", "password": "wrong-password"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Неверный email или пароль"));
    }

    @Test
    void sameEmailCannotRegisterTwice() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(NEW_USER));

        mvc.perform(post("/api/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(NEW_USER))
                .andExpect(status().isConflict());
    }

    @Test
    void changesWithoutCsrfTokenAreForbidden() throws Exception {
        User me = userRepository.save(new User("Я", "me@test.local", "x"));

        // Тот же запрос, но без .with(csrf()) — как будто его отправил чужой сайт
        mvc.perform(put("/api/wishes/2030-01-01").with(user(CurrentUser.from(me)))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"title": "Подарок"}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void someoneElsesWishIsNotFound() throws Exception {
        User owner = userRepository.save(new User("Хозяин", "owner@test.local", "x"));
        User other = userRepository.save(new User("Другой", "other@test.local", "x"));
        Wish wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.update("Секрет", "Комментарий");
        wish = wishRepository.save(wish);

        mvc.perform(get("/api/wishes/{id}", wish.getId()).with(user(CurrentUser.from(other))))
                .andExpect(status().isNotFound());
    }
}
