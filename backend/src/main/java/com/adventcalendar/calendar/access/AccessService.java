package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.cache.CalendarCaches;
import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import com.adventcalendar.calendar.wish.WishRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccessService {

    private final WishAccessRepository accessRepository;
    private final AccessRequestRepository requestRepository;
    private final WishRepository wishRepository;
    private final UserRepository userRepository;
    private final FriendService friendService;
    private final CalendarCaches caches;

    public AccessService(WishAccessRepository accessRepository,
                         AccessRequestRepository requestRepository,
                         WishRepository wishRepository,
                         UserRepository userRepository,
                         FriendService friendService,
                         CalendarCaches caches) {
        this.accessRepository = accessRepository;
        this.requestRepository = requestRepository;
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
        this.friendService = friendService;
        this.caches = caches;
    }

    // Владелец открывает свой день другу
    @Transactional
    public void grant(Long me, Long wishId, Long friendId) {
        findMyWish(me, wishId);
        if (!friendService.areFriends(me, friendId)) {
            throw new AccessException("Открыть день можно только другу");
        }
        if (!accessRepository.existsByWishIdAndViewerId(wishId, friendId)) {
            accessRepository.save(new WishAccess(wishId, friendId));
            caches.accessChanged(me, friendId);
        }
        // Если друг просил доступ к этому дню, запрос выполнен — убираем его
        requestRepository.deleteByWishIdAndFromUserId(wishId, friendId);
    }

    // Владелец закрывает свой день от друга
    @Transactional
    public void revoke(Long me, Long wishId, Long friendId) {
        findMyWish(me, wishId);
        accessRepository.deleteByWishIdAndViewerId(wishId, friendId);
        caches.accessChanged(me, friendId);
    }

    // Друг просит открыть ему день
    @Transactional
    public void request(Long me, Long wishId) {
        Wish wish = wishRepository.findById(wishId)
                .orElseThrow(() -> new WishNotFoundException(wishId));
        Long ownerId = wish.getOwner().getId();
        if (ownerId.equals(me)) {
            throw new AccessException("Это ваш собственный день");
        }
        // Чужой человек (не друг) не должен даже узнать, что такое желание есть, поэтому 404
        if (!friendService.areFriends(me, ownerId)) {
            throw new WishNotFoundException(wishId);
        }
        if (accessRepository.existsByWishIdAndViewerId(wishId, me)) {
            throw new AccessException("Этот день вам уже открыт");
        }
        if (requestRepository.existsByWishIdAndFromUserId(wishId, me)) {
            throw new AccessException("Запрос уже отправлен");
        }
        requestRepository.save(new AccessRequest(wish, userRepository.getReferenceById(me)));
    }

    // Запросы к моим дням
    @Transactional(readOnly = true)
    public List<AccessRequestResponse> incoming(Long me) {
        return requestRepository.findAllByWishOwnerIdOrderByCreatedAtAsc(me).stream()
                .map(AccessRequestResponse::from)
                .toList();
    }

    // «Открыть» на запросе = выдать доступ (запрос удалится внутри grant)
    @Transactional
    public void grantRequest(Long me, Long requestId) {
        AccessRequest request = findRequestToMe(me, requestId);
        grant(me, request.getWish().getId(), request.getFromUser().getId());
    }

    // «Отказать» = просто удалить запрос. День остаётся закрытым
    @Transactional
    public void denyRequest(Long me, Long requestId) {
        requestRepository.delete(findRequestToMe(me, requestId));
    }

    // Чужое желание (не моё) не находим: для него ответ 404
    private Wish findMyWish(Long me, Long wishId) {
        return wishRepository.findByIdAndOwnerId(wishId, me)
                .orElseThrow(() -> new WishNotFoundException(wishId));
    }

    private AccessRequest findRequestToMe(Long me, Long requestId) {
        return requestRepository.findByIdAndWishOwnerId(requestId, me)
                .orElseThrow(() -> new AccessRequestNotFoundException(requestId));
    }
}
