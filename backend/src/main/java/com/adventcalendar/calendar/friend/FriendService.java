package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserNotFoundException;
import com.adventcalendar.calendar.user.UserRepository;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FriendService {

    private final FriendshipRepository friendshipRepository;
    private final FriendRequestRepository requestRepository;
    private final UserRepository userRepository;

    public FriendService(FriendshipRepository friendshipRepository,
                         FriendRequestRepository requestRepository,
                         UserRepository userRepository) {
        this.friendshipRepository = friendshipRepository;
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public boolean areFriends(Long x, Long y) {
        return friendshipRepository.existsByUserAIdAndUserBId(Math.min(x, y), Math.max(x, y));
    }

    @Transactional(readOnly = true)
    public List<FriendResponse> friendsOf(Long me) {
        return friendshipRepository.findFriendsOf(me).stream()
                .map(FriendResponse::from)
                .toList();
    }

    @Transactional
    public void removeFriend(Long me, Long friendId) {
        friendshipRepository.deleteByUserAIdAndUserBId(Math.min(me, friendId), Math.max(me, friendId));
        // Этап 8: здесь же удалим доступы к дням между этими людьми
    }

    @Transactional(readOnly = true)
    public List<UserSearchResponse> search(Long me, String query) {
        String text = query.trim();
        if (text.isEmpty()) {
            return List.of();
        }

        // Заранее собираем, кто мне друг и с кем у меня заявки, чтобы у каждого найденного показать статус
        Set<Long> friends = friendshipRepository.findFriendsOf(me).stream()
                .map(User::getId)
                .collect(Collectors.toSet());
        Set<Long> sentTo = requestRepository.findAllByFromUserIdAndStatus(me, FriendRequestStatus.PENDING).stream()
                .map(request -> request.getToUser().getId())
                .collect(Collectors.toSet());
        Set<Long> receivedFrom = requestRepository
                .findAllByToUserIdAndStatusOrderByCreatedAtAsc(me, FriendRequestStatus.PENDING).stream()
                .map(request -> request.getFromUser().getId())
                .collect(Collectors.toSet());

        return userRepository.findTop20ByNameContainingIgnoreCaseAndIdNotOrderByNameAsc(text, me).stream()
                .map(user -> {
                    FriendRelation relation;
                    if (friends.contains(user.getId())) relation = FriendRelation.FRIEND;
                    else if (sentTo.contains(user.getId())) relation = FriendRelation.REQUEST_SENT;
                    else if (receivedFrom.contains(user.getId())) relation = FriendRelation.REQUEST_RECEIVED;
                    else relation = FriendRelation.NONE;
                    return new UserSearchResponse(user.getId(), user.getName(), relation);
                })
                .toList();
    }

    @Transactional
    public void sendRequest(Long me, Long toUserId) {
        if (me.equals(toUserId)) {
            throw new FriendRequestException("Нельзя добавить в друзья самого себя");
        }
        User to = userRepository.findById(toUserId)
                .orElseThrow(() -> new UserNotFoundException(toUserId));
        if (areFriends(me, toUserId)) {
            throw new FriendRequestException("Вы уже друзья");
        }
        if (requestRepository.existsByFromUserIdAndToUserIdAndStatus(me, toUserId, FriendRequestStatus.PENDING)) {
            throw new FriendRequestException("Заявка уже отправлена");
        }
        if (requestRepository.existsByFromUserIdAndToUserIdAndStatus(toUserId, me, FriendRequestStatus.PENDING)) {
            throw new FriendRequestException("Этот человек уже прислал вам заявку. Примите её");
        }
        requestRepository.save(new FriendRequest(userRepository.getReferenceById(me), to));
    }

    @Transactional(readOnly = true)
    public List<FriendRequestResponse> incoming(Long me) {
        return requestRepository.findAllByToUserIdAndStatusOrderByCreatedAtAsc(me, FriendRequestStatus.PENDING).stream()
                .map(FriendRequestResponse::from)
                .toList();
    }

    @Transactional
    public void accept(Long me, Long requestId) {
        FriendRequest request = findIncomingPending(me, requestId);
        request.accept(); // save() не нужен: Hibernate сам заметит изменение и обновит строку
        Long fromId = request.getFromUser().getId();
        if (!areFriends(me, fromId)) {
            friendshipRepository.save(Friendship.between(me, fromId));
        }
    }

    @Transactional
    public void decline(Long me, Long requestId) {
        findIncomingPending(me, requestId).decline();
    }

    // Чужую заявку (не мне) или уже отвеченную не находим: для них ответ 404
    private FriendRequest findIncomingPending(Long me, Long requestId) {
        return requestRepository.findByIdAndToUserIdAndStatus(requestId, me, FriendRequestStatus.PENDING)
                .orElseThrow(() -> new FriendRequestNotFoundException(requestId));
    }
}