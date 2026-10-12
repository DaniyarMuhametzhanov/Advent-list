package com.adventcalendar.calendar.holiday;

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

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.friend.Friendship;
import com.adventcalendar.calendar.friend.FriendshipRepository;
import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

// Свои праздники: добавить (можно несколько в день), переименовать, удалить. Чужие праздники не видны
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@Transactional
class HolidayRulesTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired FriendshipRepository friendshipRepository;
    @Autowired WishRepository wishRepository;

    User me;
    User other;

    @BeforeEach
    void setUp() {
        me = userRepository.save(new User("Я", "me@test.local", "x"));
        other = userRepository.save(new User("Другой", "other@test.local", "x"));
    }

    private RequestPostProcessor as(User u) {
        return user(CurrentUser.from(u));
    }

    // Добавить праздник. Возвращает id нового праздника — по нему потом переименовываем и удаляем
    private ResultActions add(User u, String path, String title) throws Exception {
        return mvc.perform(post("/api/holidays/" + path).with(as(u)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\": \"" + title + "\"}"));
    }

    private long addAndGetId(User u, String path, String title) throws Exception {
        String json = add(u, path, title).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private ResultActions rename(User u, long id, String title) throws Exception {
        return mvc.perform(put("/api/holidays/" + id).with(as(u)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\": \"" + title + "\"}"));
    }

    @Test
    void addedHolidayIsInMyList() throws Exception {
        add(me, "3/15", " День рождения мамы ").andExpect(status().isCreated());

        mvc.perform(get("/api/holidays").with(as(me)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].month").value(3))
                .andExpect(jsonPath("$[0].day").value(15))
                .andExpect(jsonPath("$[0].title").value("День рождения мамы")); // пробелы по краям убраны
    }

    @Test
    void oneDayCanHaveSeveralHolidays() throws Exception {
        add(me, "3/15", "День рождения мамы");
        add(me, "3/15", "Годовщина");

        mvc.perform(get("/api/holidays").with(as(me)))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].title").value("День рождения мамы")) // в порядке добавления
                .andExpect(jsonPath("$[1].title").value("Годовщина"));
    }

    @Test
    void renameChangesOnlyTitle() throws Exception {
        long id = addAndGetId(me, "3/15", "Старое");

        rename(me, id, "Новое").andExpect(status().isOk());

        mvc.perform(get("/api/holidays").with(as(me)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].day").value(15))
                .andExpect(jsonPath("$[0].title").value("Новое"));
    }

    @Test
    void otherPeopleDoNotSeeMyHolidays() throws Exception {
        add(me, "3/15", "День рождения мамы");

        mvc.perform(get("/api/holidays").with(as(other))).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void otherPeopleCannotChangeMyHoliday() throws Exception {
        long id = addAndGetId(me, "3/15", "Мой");

        rename(other, id, "Взлом").andExpect(status().isNotFound());
        mvc.perform(delete("/api/holidays/" + id).with(as(other)).with(csrf())).andExpect(status().isNotFound());

        mvc.perform(get("/api/holidays").with(as(me))).andExpect(jsonPath("$[0].title").value("Мой"));
    }

    @Test
    void deleteRemovesOnlyThatHoliday() throws Exception {
        long id = addAndGetId(me, "3/15", "Первый");
        add(me, "3/15", "Второй");

        mvc.perform(delete("/api/holidays/" + id).with(as(me)).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(get("/api/holidays").with(as(me)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].title").value("Второй"));
    }

    @Test
    void impossibleDateIsRejected() throws Exception {
        add(me, "4/31", "Праздник").andExpect(status().isBadRequest());
        add(me, "13/1", "Праздник").andExpect(status().isBadRequest());
        add(me, "2/29", "Високосный").andExpect(status().isCreated()); // 29 февраля бывает
    }

    @Test
    void emptyTitleIsRejected() throws Exception {
        add(me, "3/15", "  ").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.title").value("Введите название праздника"));
    }

    @Test
    void friendSeesHolidaysOnlyInOpenedDay() throws Exception {
        friendshipRepository.save(Friendship.between(me.getId(), other.getId()));
        Wish wish = new Wish(me, LocalDate.of(2030, 1, 10));
        wish.update("Шарф", "");
        wish = wishRepository.save(wish);
        add(me, "1/10", "День рождения мамы");
        String calendar = "/api/calendars/" + me.getId() + "?month=2030-01";

        // День закрыт: праздника в ответе нет вообще
        mvc.perform(get(calendar).with(as(other)))
                .andExpect(jsonPath("$[0].holidays", hasSize(0)))
                .andExpect(content().string(not(containsString("День рождения мамы"))));

        // Открыли день другу — праздник виден
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), other.getId()).with(as(me)).with(csrf()));
        mvc.perform(get(calendar).with(as(other)))
                .andExpect(jsonPath("$[0].holidays[0]").value("День рождения мамы"));
    }
}
