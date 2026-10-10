package com.adventcalendar.calendar.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adventcalendar.calendar.friend.Friendship;
import com.adventcalendar.calendar.friend.FriendshipRepository;
import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

// Проверяем правила доступа через настоящие адреса (API), как это делал бы браузер.
// @Transactional: после каждого теста всё, что он записал в базу, откатывается
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AccessRulesTest {

    private static final String SECRET_TITLE = "Секретный подарок";
    private static final String SECRET_COMMENT = "Никому не говорить";
    private static final String MONTH = "2030-01";

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired FriendshipRepository friendshipRepository;
    @Autowired WishRepository wishRepository;
    @Autowired WishAccessRepository accessRepository;
    @Autowired AccessRequestRepository requestRepository;
    @Autowired EntityManager entityManager;

    User owner;    // хозяин календаря
    User friend;   // его друг
    User stranger; // чужой человек
    Wish wish;     // желание хозяина на 10 января 2030

    @BeforeEach
    void setUp() {
        owner = userRepository.save(new User("Хозяин", "owner@test.local", "x"));
        friend = userRepository.save(new User("Друг", "friend@test.local", "x"));
        stranger = userRepository.save(new User("Чужой", "stranger@test.local", "x"));
        friendshipRepository.save(Friendship.between(owner.getId(), friend.getId()));

        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.update(SECRET_TITLE, SECRET_COMMENT);
        wish = wishRepository.save(wish);
    }

    // «Войти» как этот человек для одного запроса
    private RequestPostProcessor as(User u) {
        return user(CurrentUser.from(u));
    }

    private String calendarOf(User u) {
        return "/api/calendars/" + u.getId() + "?month=" + MONTH;
    }

    @Test
    void strangerCannotSeeCalendar() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(stranger)))
                .andExpect(status().isForbidden());
    }

    @Test
    void closedDayHasNoTitleAndComment() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(jsonPath("$[0].title").doesNotExist())
                // Самая строгая проверка: секретных слов нет нигде в ответе
                .andExpect(content().string(not(containsString(SECRET_TITLE))))
                .andExpect(content().string(not(containsString(SECRET_COMMENT))));
    }

    @Test
    void grantedDayIsOpenAndRevokedDayIsClosedAgain() throws Exception {
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(true))
                .andExpect(jsonPath("$[0].title").value(SECRET_TITLE));

        mvc.perform(delete("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(content().string(not(containsString(SECRET_TITLE))));
    }

    @Test
    void ownerSeesWhoHasAccess() throws Exception {
        accessRepository.save(new WishAccess(wish.getId(), friend.getId()));
        mvc.perform(get("/api/wishes/{w}", wish.getId()).with(as(owner)))
                .andExpect(jsonPath("$.access[0]").value(friend.getId()));
    }

    @Test
    void onlyOwnerCanGrantAccess() throws Exception {
        // Друг пытается открыть чужое желание сам себе
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(friend)).with(csrf()))
                .andExpect(status().isNotFound());
        assertThat(accessRepository.existsByWishIdAndViewerId(wish.getId(), friend.getId())).isFalse();
    }

    @Test
    void accessCanBeGrantedOnlyToFriend() throws Exception {
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), stranger.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isConflict());
        assertThat(accessRepository.existsByWishIdAndViewerId(wish.getId(), stranger.getId())).isFalse();
    }

    @Test
    void friendRequestsAccessOnceAndOwnerGrantsIt() throws Exception {
        String requestUrl = "/api/wishes/" + wish.getId() + "/access-requests";
        mvc.perform(post(requestUrl).with(as(friend)).with(csrf())).andExpect(status().isCreated());
        // Повторно отправить нельзя
        mvc.perform(post(requestUrl).with(as(friend)).with(csrf())).andExpect(status().isConflict());
        // В календаре друг видит, что уже просил
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].requested").value(true));

        // Хозяин видит запрос у себя
        mvc.perform(get("/api/access-requests/incoming").with(as(owner)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].from.id").value(friend.getId()));
        Long requestId = requestRepository.findAllByWishOwnerIdOrderByCreatedAtAsc(owner.getId()).getFirst().getId();

        // Друг не может сам одобрить свой запрос
        mvc.perform(post("/api/access-requests/{id}/grant", requestId).with(as(friend)).with(csrf()))
                .andExpect(status().isNotFound());

        mvc.perform(post("/api/access-requests/{id}/grant", requestId).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(true));
        assertThat(requestRepository.count()).isEqualTo(countSeedRequests());
    }

    @Test
    void deniedRequestKeepsDayClosed() throws Exception {
        mvc.perform(post("/api/wishes/{w}/access-requests", wish.getId()).with(as(friend)).with(csrf()))
                .andExpect(status().isCreated());
        Long requestId = requestRepository.findAllByWishOwnerIdOrderByCreatedAtAsc(owner.getId()).getFirst().getId();

        mvc.perform(post("/api/access-requests/{id}/deny", requestId).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(jsonPath("$[0].requested").value(false));
    }

    @Test
    void strangerCannotRequestAccess() throws Exception {
        mvc.perform(post("/api/wishes/{w}/access-requests", wish.getId()).with(as(stranger)).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void deletingWishDeletesItsAccessAndRequests() throws Exception {
        accessRepository.save(new WishAccess(wish.getId(), friend.getId()));
        requestRepository.save(new AccessRequest(wish, stranger));
        // Записать всё в базу и «забыть» загруженные объекты, как будто это новый запрос к серверу
        entityManager.flush();
        entityManager.clear();

        mvc.perform(delete("/api/wishes/{w}", wish.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        entityManager.flush(); // отправить DELETE в базу прямо сейчас, чтобы сработал ON DELETE CASCADE

        assertThat(accessRepository.findAllByWishIdIn(List.of(wish.getId()))).isEmpty();
        assertThat(requestRepository.existsByWishIdAndFromUserId(wish.getId(), stranger.getId())).isFalse();
    }

    @Test
    void unfriendingRemovesAccessBothWays() throws Exception {
        Wish friendsWish = new Wish(friend, LocalDate.of(2030, 1, 20));
        friendsWish.update("Желание друга", null);
        friendsWish = wishRepository.save(friendsWish);
        accessRepository.save(new WishAccess(wish.getId(), friend.getId()));
        accessRepository.save(new WishAccess(friendsWish.getId(), owner.getId()));

        mvc.perform(delete("/api/friends/{id}", friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(accessRepository.existsByWishIdAndViewerId(wish.getId(), friend.getId())).isFalse();
        assertThat(accessRepository.existsByWishIdAndViewerId(friendsWish.getId(), owner.getId())).isFalse();
    }

    // Запросы из тестовых данных (V4) тоже лежат в базе, их не трогаем
    private long countSeedRequests() {
        return requestRepository.findAll().stream()
                .filter(r -> !r.getWish().getId().equals(wish.getId()))
                .count();
    }
}
