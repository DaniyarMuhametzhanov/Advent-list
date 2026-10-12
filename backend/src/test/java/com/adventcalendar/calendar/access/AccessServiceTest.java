package com.adventcalendar.calendar.access;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import com.adventcalendar.calendar.wish.WishRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class AccessServiceTest {

    private static final Long OWNER_ID = 1L;
    private static final Long FRIEND_ID = 2L;
    private static final Long WISH_ID = 5L;

    @Mock WishAccessRepository accessRepository;
    @Mock AccessRequestRepository requestRepository;
    @Mock WishRepository wishRepository;
    @Mock UserRepository userRepository;
    @Mock FriendService friendService;

    @InjectMocks AccessService service;

    Wish wish;

    @BeforeEach
    void setUp() {
        User owner = new User("Хозяин", "owner@test.local", "x");
        ReflectionTestUtils.setField(owner, "id", OWNER_ID);
        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        ReflectionTestUtils.setField(wish, "id", WISH_ID);
    }

    @Test
    void cannotGrantAccessToNotFriend() {
        when(wishRepository.findByIdAndOwnerId(WISH_ID, OWNER_ID)).thenReturn(Optional.of(wish));
        when(friendService.areFriends(OWNER_ID, FRIEND_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.grant(OWNER_ID, WISH_ID, FRIEND_ID))
                .isInstanceOf(AccessException.class)
                .hasMessage("Открыть день можно только другу");
        verify(accessRepository, never()).save(any());
    }

    @Test
    void grantSavesAccessAndRemovesPendingRequest() {
        when(wishRepository.findByIdAndOwnerId(WISH_ID, OWNER_ID)).thenReturn(Optional.of(wish));
        when(friendService.areFriends(OWNER_ID, FRIEND_ID)).thenReturn(true);
        when(accessRepository.existsByWishIdAndViewerId(WISH_ID, FRIEND_ID)).thenReturn(false);

        service.grant(OWNER_ID, WISH_ID, FRIEND_ID);

        verify(accessRepository).save(any(WishAccess.class));
        verify(requestRepository).deleteByWishIdAndFromUserId(WISH_ID, FRIEND_ID);
    }

    @Test
    void cannotGrantAccessToSomeoneElsesWish() {
        // Друг пытается открыть желание хозяина: среди «его» желаний такого нет
        when(wishRepository.findByIdAndOwnerId(WISH_ID, FRIEND_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.grant(FRIEND_ID, WISH_ID, FRIEND_ID))
                .isInstanceOf(WishNotFoundException.class);
        verify(accessRepository, never()).save(any());
    }

    @Test
    void cannotRequestAccessToOwnDay() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));

        assertThatThrownBy(() -> service.request(OWNER_ID, WISH_ID))
                .isInstanceOf(AccessException.class)
                .hasMessage("Это ваш собственный день");
    }

    @Test
    void strangerRequestLooksLikeWishDoesNotExist() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));
        when(friendService.areFriends(FRIEND_ID, OWNER_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.request(FRIEND_ID, WISH_ID))
                .isInstanceOf(WishNotFoundException.class);
        verify(requestRepository, never()).save(any());
    }

    @Test
    void cannotRequestTwice() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));
        when(friendService.areFriends(FRIEND_ID, OWNER_ID)).thenReturn(true);
        when(accessRepository.existsByWishIdAndViewerId(WISH_ID, FRIEND_ID)).thenReturn(false);
        when(requestRepository.existsByWishIdAndFromUserId(WISH_ID, FRIEND_ID)).thenReturn(true);

        assertThatThrownBy(() -> service.request(FRIEND_ID, WISH_ID))
                .isInstanceOf(AccessException.class)
                .hasMessage("Запрос уже отправлен");
        verify(requestRepository, never()).save(any());
    }
}
