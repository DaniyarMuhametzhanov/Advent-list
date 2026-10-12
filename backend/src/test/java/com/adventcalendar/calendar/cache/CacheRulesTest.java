package com.adventcalendar.calendar.cache;

import static org.hamcrest.Matchers.containsString;
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

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.friend.FriendRequestRepository;
import com.adventcalendar.calendar.friend.FriendRequestStatus;
import com.adventcalendar.calendar.friend.Friendship;
import com.adventcalendar.calendar.friend.FriendshipRepository;
import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

// Правила кэша. Здесь НЕТ @Transactional, и это важно: кэш пишется только после коммита,
// а в тесте с @Transactional коммита не бывает (всё откатывается) — кэш бы просто не работал.
// Поэтому всё, что тест создал, удаляем сами в @AfterEach
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
class CacheRulesTest {

    private static final String SECRET_TITLE = "Секретный подарок";
    private static final String MONTH = "2031-01";

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired FriendshipRepository friendshipRepository;
    @Autowired FriendRequestRepository friendRequestRepository;
    @Autowired WishRepository wishRepository;
    @Autowired CacheManager cacheManager;

    User owner;
    User friend;
    User stranger;
    Wish wish;

    @BeforeEach
    void setUp() {
        clearCaches();
        owner = userRepository.save(new User("Хозяин", "cache-owner@test.local", "x"));
        friend = userRepository.save(new User("Друг", "cache-friend@test.local", "x"));
        stranger = userRepository.save(new User("Чужой", "cache-stranger@test.local", "x"));
        friendshipRepository.save(Friendship.between(owner.getId(), friend.getId()));

        wish = new Wish(owner, LocalDate.of(2031, 1, 10));
        wish.update(SECRET_TITLE, "Никому не говорить");
        wish = wishRepository.save(wish);
    }

    @AfterEach
    void tearDown() {
        // Желания, друзья, доступы и праздники удалит сама база: ON DELETE CASCADE
        userRepository.deleteAllInBatch(List.of(owner, friend, stranger));
        clearCaches();
    }

    private void clearCaches() {
        cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    }

    private RequestPostProcessor as(User u) {
        return user(CurrentUser.from(u));
    }

    private String calendarOf(User u) {
        return "/api/calendars/" + u.getId() + "?month=" + MONTH;
    }

    @Test
    void secondReadComesFromCache() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].title").value(SECRET_TITLE));

        // Меняем название в обход сервиса, прямо в базе. Кэш об этом не знает
        Wish fromDb = wishRepository.findById(wish.getId()).orElseThrow();
        fromDb.update("Изменено в базе", null);
        wishRepository.save(fromDb);

        // Всё ещё старое название: ответ пришёл из кэша, а не из базы
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].title").value(SECRET_TITLE));
    }

    @Test
    void savingWishThroughApiClearsCache() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].title").value(SECRET_TITLE));

        mvc.perform(put("/api/wishes/2031-01-10").with(as(owner)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"Новый велосипед\"}"))
                .andExpect(status().isOk());

        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].title").value("Новый велосипед"));
    }

    @Test
    void ownersCachedCalendarDoesNotLeakToFriend() throws Exception {
        // Хозяин смотрит первым: в кэше лежит его календарь со ВСЕМИ секретами
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].open").value(true));

        // Друг берёт тот же кэш, но закрытый день ему всё равно приходит пустым
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(content().string(not(containsString(SECRET_TITLE))));
    }

    @Test
    void grantAndRevokeClearAccessCache() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false));

        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(true));

        mvc.perform(delete("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(content().string(not(containsString(SECRET_TITLE))));
    }

    @Test
    void removedFriendLosesCalendarAtOnce() throws Exception {
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(status().isOk()); // теперь в кэше: «друзья» и «день открыт»

        mvc.perform(delete("/api/friends/{id}", friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());

        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(status().isForbidden());
    }

    @Test
    void newFriendSeesCalendarAtOnce() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(stranger)))
                .andExpect(status().isForbidden()); // в кэше: «не друзья»

        mvc.perform(post("/api/friend-requests").with(as(stranger)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toUserId\": " + owner.getId() + "}"))
                .andExpect(status().isCreated());
        Long requestId = friendRequestRepository
                .findAllByToUserIdAndStatusOrderByCreatedAtAsc(owner.getId(), FriendRequestStatus.PENDING)
                .getFirst().getId();
        mvc.perform(post("/api/friend-requests/{id}/accept", requestId).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());

        mvc.perform(get(calendarOf(owner)).with(as(stranger)))
                .andExpect(status().isOk());
    }

    @Test
    void newHolidayClearsCache() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].holidays").isEmpty());

        mvc.perform(post("/api/holidays/1/10").with(as(owner)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"День рождения\"}"))
                .andExpect(status().isCreated());

        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].holidays[0]").value("День рождения"));
    }
}
