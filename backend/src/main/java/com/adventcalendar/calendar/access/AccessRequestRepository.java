package com.adventcalendar.calendar.access;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface AccessRequestRepository extends JpaRepository<AccessRequest, Long> {

    boolean existsByWishIdAndFromUserId(Long wishId, Long fromUserId);

    long deleteByWishIdAndFromUserId(Long wishId, Long fromUserId);

    // Ответить на запрос может только владелец желания. Чужой запрос не находим → 404
    Optional<AccessRequest> findByIdAndWishOwnerId(Long id, Long ownerId);

    // Запросы к моим желаниям. Сразу подгружаем желание и автора запроса: нужны дата, название и имя
    @EntityGraph(attributePaths = {"wish", "fromUser"})
    List<AccessRequest> findAllByWishOwnerIdOrderByCreatedAtAsc(Long ownerId);

    // К каким из этих желаний я уже отправил запрос
    @Query("select r.wish.id from AccessRequest r where r.fromUser.id = :fromUserId and r.wish.id in :wishIds")
    List<Long> findRequestedWishIds(Long fromUserId, Collection<Long> wishIds);

    // Удалить все запросы, которые fromUserId отправлял к желаниям ownerId
    @Modifying
    @Query("""
            delete from AccessRequest r
            where r.fromUser.id = :fromUserId
              and r.wish.id in (select w.id from Wish w where w.owner.id = :ownerId)
            """)
    int deleteAllSentTo(Long ownerId, Long fromUserId);
}
