package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.access.AccessRequestRepository;
import com.adventcalendar.calendar.access.WishAccess;
import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.friend.NotFriendsException;
import com.adventcalendar.calendar.image.ImageStorage;
import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WishService {

    private final WishRepository wishRepository;
    private final UserRepository userRepository;
    private final FriendService friendService;
    private final WishAccessRepository accessRepository;
    private final AccessRequestRepository requestRepository;
    private final ImageStorage imageStorage;

    public WishService(WishRepository wishRepository, UserRepository userRepository, FriendService friendService,
                       WishAccessRepository accessRepository, AccessRequestRepository requestRepository,
                       ImageStorage imageStorage) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
        this.friendService = friendService;
        this.accessRepository = accessRepository;
        this.requestRepository = requestRepository;
        this.imageStorage = imageStorage;
    }

    @Transactional(readOnly = true)
    public List<WishResponse> findAll(Long ownerId) {
        List<Wish> wishes = wishRepository.findAllByOwnerIdOrderByDateAsc(ownerId);
        // Доступы ко всем моим желаниям одним запросом: { id желания → [id друзей] }
        Map<Long, List<Long>> access = accessRepository
                .findAllByWishIdIn(wishes.stream().map(Wish::getId).toList()).stream()
                .collect(Collectors.groupingBy(WishAccess::getWishId,
                        Collectors.mapping(WishAccess::getViewerId, Collectors.toList())));
        return wishes.stream()
                .map(wish -> WishResponse.from(wish, access.getOrDefault(wish.getId(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public WishResponse findById(Long ownerId, Long id) {
        return wishRepository.findByIdAndOwnerId(id, ownerId)
                .map(this::withAccess)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    @Transactional
    public WishResponse saveForDate(Long ownerId, LocalDate date, WishRequest request) {
        Wish wish = wishRepository.findByOwnerIdAndDate(ownerId, date)
                .orElseGet(() -> new Wish(userRepository.getReferenceById(ownerId), date));
        wish.update(request.title(), request.comment());
        return withAccess(wishRepository.save(wish));
    }

    // Доступы и запросы доступа к желанию удалит сама база: ON DELETE CASCADE в V4__access.sql.
    // А файлы картинки в MinIO база не видит — их удаляем сами
    @Transactional
    public void delete(Long ownerId, Long id) {
        Wish wish = wishRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new WishNotFoundException(id));
        wishRepository.delete(wish);
        if (wish.getImageKey() != null) {
            imageStorage.delete(wish.getImageKey());
        }
    }

    @Transactional(readOnly = true)
    public List<CalendarDayResponse> calendar(Long viewerId, Long ownerId, YearMonth month) {
        boolean isOwner = viewerId.equals(ownerId);
        // Чужой календарь можно смотреть только другу. Проверяем здесь, на сервере
        if (!isOwner && !friendService.areFriends(viewerId, ownerId)) {
            throw new NotFriendsException();
        }
        List<Wish> wishes = wishRepository.findAllByOwnerIdAndDateBetweenOrderByDateAsc(
                ownerId, month.atDay(1), month.atEndOfMonth());
        if (isOwner) {
            return wishes.stream().map(CalendarDayResponse::open).toList();
        }

        // Какие из этих дней открыты смотрящему и к каким он уже просил доступ
        List<Long> ids = wishes.stream().map(Wish::getId).toList();
        Set<Long> openIds = new HashSet<>(accessRepository.findOpenWishIds(viewerId, ids));
        Set<Long> requestedIds = new HashSet<>(requestRepository.findRequestedWishIds(viewerId, ids));

        // Главное правило: у закрытого дня название и комментарий даже не попадают в ответ
        return wishes.stream()
                .map(wish -> openIds.contains(wish.getId())
                        ? CalendarDayResponse.open(wish)
                        : CalendarDayResponse.closed(wish, requestedIds.contains(wish.getId())))
                .toList();
    }

    private WishResponse withAccess(Wish wish) {
        List<Long> access = accessRepository.findAllByWishIdIn(List.of(wish.getId())).stream()
                .map(WishAccess::getViewerId)
                .toList();
        return WishResponse.from(wish, access);
    }
}
