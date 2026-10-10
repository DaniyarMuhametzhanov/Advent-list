package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.friend.NotFriendsException;
import java.time.YearMonth;

@Service
public class WishService {

    private final WishRepository wishRepository;
    private final UserRepository userRepository;
    private final FriendService friendService;

    public WishService(WishRepository wishRepository, UserRepository userRepository, FriendService friendService) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
        this.friendService = friendService;
    }

    @Transactional(readOnly = true)
    public List<WishResponse> findAll(Long ownerId) {
        return wishRepository.findAllByOwnerIdOrderByDateAsc(ownerId).stream()
                .map(WishResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public WishResponse findById(Long ownerId, Long id) {
        return wishRepository.findByIdAndOwnerId(id, ownerId)
                .map(WishResponse::from)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    @Transactional
    public WishResponse saveForDate(Long ownerId, LocalDate date, WishRequest request) {
        Wish wish = wishRepository.findByOwnerIdAndDate(ownerId, date)
                .orElseGet(() -> new Wish(userRepository.getReferenceById(ownerId), date));
        wish.update(request.title(), request.comment());
        return WishResponse.from(wishRepository.save(wish));
    }

    @Transactional
    public void delete(Long ownerId, Long id) {
        Wish wish = wishRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new WishNotFoundException(id));
        wishRepository.delete(wish);
    }

    @Transactional(readOnly = true)
    public List<CalendarDayResponse> calendar(Long viewerId, Long ownerId, YearMonth month) {
        boolean isOwner = viewerId.equals(ownerId);
        // Чужой календарь можно смотреть только другу. Проверяем здесь, на сервере
        if (!isOwner && !friendService.areFriends(viewerId, ownerId)) {
            throw new NotFriendsException();
        }
        return wishRepository.findAllByOwnerIdAndDateBetweenOrderByDateAsc(
                        ownerId, month.atDay(1), month.atEndOfMonth()).stream()
                // Пока (до этапа 8) у друзей все дни закрыты: видно только, что день занят
                .map(wish -> isOwner ? CalendarDayResponse.open(wish) : CalendarDayResponse.closed(wish))
                .toList();
    }
}