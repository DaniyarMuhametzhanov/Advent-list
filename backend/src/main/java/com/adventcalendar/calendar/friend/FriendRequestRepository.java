package com.adventcalendar.calendar.friend;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendRequestRepository extends JpaRepository<FriendRequest, Long> {

    boolean existsByFromUserIdAndToUserIdAndStatus(Long fromUserId, Long toUserId, FriendRequestStatus status);

    // Заявку может принять или отклонить только тот, кому она пришла
    Optional<FriendRequest> findByIdAndToUserIdAndStatus(Long id, Long toUserId, FriendRequestStatus status);

    // Заявки, которые пришли мне. Сразу подгружаем отправителя, чтобы знать его имя
    @EntityGraph(attributePaths = "fromUser")
    List<FriendRequest> findAllByToUserIdAndStatusOrderByCreatedAtAsc(Long toUserId, FriendRequestStatus status);

    // Заявки, которые отправил я
    List<FriendRequest> findAllByFromUserIdAndStatus(Long fromUserId, FriendRequestStatus status);
}