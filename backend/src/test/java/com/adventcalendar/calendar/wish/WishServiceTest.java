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
import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.friend.NotFriendsException;
import com.adventcalendar.calendar.holiday.HolidayRepository;
import com.adventcalendar.calendar.image.ImageStorage;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
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
    @Mock HolidayRepository holidayRepository;

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

    private void ownerHasOneWish() {
        when(wishRepository.findAllByOwnerIdAndDateBetweenOrderByDateAsc(
                OWNER_ID, MONTH.atDay(1), MONTH.atEndOfMonth())).thenReturn(List.of(wish));
    }

    @Test
    void strangerCannotSeeCalendar() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.calendar(VIEWER_ID, OWNER_ID, MONTH))
                .isInstanceOf(NotFriendsException.class);
        verifyNoInteractions(wishRepository); // до базы дело даже не дошло
    }

    @Test
    void closedDayHasNoTitleCommentAndImage() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(true);
        ownerHasOneWish();
        when(accessRepository.findOpenWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of());
        when(requestRepository.findRequestedWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of(5L));

        CalendarDayResponse day = service.calendar(VIEWER_ID, OWNER_ID, MONTH).getFirst();

        assertThat(day.open()).isFalse();
        assertThat(day.requested()).isTrue();
        assertThat(day.title()).isNull();
        assertThat(day.comment()).isNull();
        assertThat(day.imageUrl()).isNull();
        assertThat(day.thumbUrl()).isNull();
    }

    @Test
    void openDayShowsEverything() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(true);
        ownerHasOneWish();
        when(accessRepository.findOpenWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of(5L));
        when(requestRepository.findRequestedWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of());

        CalendarDayResponse day = service.calendar(VIEWER_ID, OWNER_ID, MONTH).getFirst();

        assertThat(day.open()).isTrue();
        assertThat(day.title()).isEqualTo("Секретный подарок");
        assertThat(day.comment()).isEqualTo("Никому не говорить");
        assertThat(day.thumbUrl()).contains("size=thumb");
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
    }

    @Test
    void cannotDeleteSomeoneElsesWish() {
        when(wishRepository.findByIdAndOwnerId(5L, VIEWER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(VIEWER_ID, 5L)).isInstanceOf(WishNotFoundException.class);
        verify(wishRepository, never()).delete(any());
        verifyNoInteractions(imageStorage);
    }
}
