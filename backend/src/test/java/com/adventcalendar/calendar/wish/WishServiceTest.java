package com.adventcalendar.calendar.wish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.adventcalendar.calendar.access.AccessRequestRepository;
import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.cache.CalendarCaches;
import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.friend.NotFriendsException;
import com.adventcalendar.calendar.image.ImageStorage;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

// Юнит-тест: проверяем только WishService. Базы нет, Spring не запускается.
// Все «соседи» сервиса — заглушки (@Mock), и мы сами говорим, что они отвечают
@ExtendWith(MockitoExtension.class)
class WishServiceTest {

    private static final Long OWNER_ID = 1L;
    private static final Long VIEWER_ID = 2L;
    private static final YearMonth MONTH = YearMonth.of(2030, 1);

    @Mock WishRepository wishRepository;
    @Mock UserRepository userRepository;
    @Mock FriendService friendService;
    @Mock WishAccessRepository accessRepository;
    @Mock AccessRequestRepository requestRepository;
    @Mock ImageStorage imageStorage;
    @Mock OwnerCalendarService ownerCalendar;
    @Mock CalendarCaches caches;

    @InjectMocks WishService service; // настоящий сервис, в который подставлены заглушки выше

    Wish wish;

    @BeforeEach
    void setUp() {
        User owner = new User("Хозяин", "owner@test.local", "x");
        ReflectionTestUtils.setField(owner, "id", OWNER_ID); // id обычно ставит база, здесь — мы сами
        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.update("Секретный подарок", "Никому не говорить");
        wish.setImageKey("abc");
        ReflectionTestUtils.setField(wish, "id", 5L);
    }

    // «Кэш» владельца: один открытый день 10 января 2030 с праздником
    private void ownerHasOneWish() {
        when(ownerCalendar.allDays(OWNER_ID))
                .thenReturn(List.of(CalendarDayResponse.open(wish, List.of("День рождения"))));
    }

    @Test
    void strangerCannotSeeCalendar() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.calendar(VIEWER_ID, OWNER_ID, MONTH))
                .isInstanceOf(NotFriendsException.class);
        verifyNoInteractions(ownerCalendar); // до календаря (и до кэша) дело даже не дошло
    }

    @Test
    void closedDayHasNoTitleCommentAndImage() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(true);
        ownerHasOneWish();
        when(accessRepository.findOpenWishIdsOfOwner(VIEWER_ID, OWNER_ID)).thenReturn(Set.of());
        when(requestRepository.findRequestedWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of(5L));

        CalendarDayResponse day = service.calendar(VIEWER_ID, OWNER_ID, MONTH).getFirst();

        assertThat(day.open()).isFalse();
        assertThat(day.requested()).isTrue();
        assertThat(day.title()).isNull();
        assertThat(day.comment()).isNull();
        assertThat(day.imageUrl()).isNull();
        assertThat(day.thumbUrl()).isNull();
        assertThat(day.holidays()).isEmpty();
    }

    @Test
    void openDayShowsEverything() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(true);
        ownerHasOneWish();
        when(accessRepository.findOpenWishIdsOfOwner(VIEWER_ID, OWNER_ID)).thenReturn(Set.of(5L));
        when(requestRepository.findRequestedWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of());

        CalendarDayResponse day = service.calendar(VIEWER_ID, OWNER_ID, MONTH).getFirst();

        assertThat(day.open()).isTrue();
        assertThat(day.title()).isEqualTo("Секретный подарок");
        assertThat(day.comment()).isEqualTo("Никому не говорить");
        assertThat(day.thumbUrl()).contains("size=thumb");
        assertThat(day.holidays()).containsExactly("День рождения");
    }

    @Test
    void otherMonthsAreFilteredOut() {
        ownerHasOneWish(); // желание в январе 2030

        assertThat(service.calendar(OWNER_ID, OWNER_ID, YearMonth.of(2030, 2))).isEmpty();
    }

    @Test
    void savingWishClearsOwnerCalendarCache() {
        when(wishRepository.findByOwnerIdAndDate(OWNER_ID, wish.getDate())).thenReturn(Optional.of(wish));
        when(wishRepository.save(wish)).thenReturn(wish);

        service.saveForDate(OWNER_ID, wish.getDate(), new WishRequest("Новое", null));

        verify(caches).calendarChanged(OWNER_ID);
    }

    @Test
    void ownerSeesOwnCalendarWithoutFriendCheck() {
        ownerHasOneWish();

        CalendarDayResponse day = service.calendar(OWNER_ID, OWNER_ID, MONTH).getFirst();

        assertThat(day.open()).isTrue();
        verifyNoInteractions(friendService, accessRepository);
    }

    @Test
    void deletingWishAlsoDeletesItsImageFiles() {
        when(wishRepository.findByIdAndOwnerId(5L, OWNER_ID)).thenReturn(Optional.of(wish));

        service.delete(OWNER_ID, 5L);

        verify(wishRepository).delete(wish);
        verify(imageStorage).delete("abc");
        verify(caches).calendarChanged(OWNER_ID);
    }

    @Test
    void cannotDeleteSomeoneElsesWish() {
        when(wishRepository.findByIdAndOwnerId(5L, VIEWER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(VIEWER_ID, 5L)).isInstanceOf(WishNotFoundException.class);
        verify(wishRepository, never()).delete(any());
        verifyNoInteractions(imageStorage);
    }
}
