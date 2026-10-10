package com.adventcalendar.calendar.access;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface WishAccessRepository extends JpaRepository<WishAccess, Long> {

    boolean existsByWishIdAndViewerId(Long wishId, Long viewerId);

    long deleteByWishIdAndViewerId(Long wishId, Long viewerId);

    // Все доступы к нескольким желаниям сразу (одним запросом, а не по запросу на каждое желание)
    List<WishAccess> findAllByWishIdIn(Collection<Long> wishIds);

    // Какие из этих желаний открыты человеку viewerId
    @Query("select a.wishId from WishAccess a where a.viewerId = :viewerId and a.wishId in :wishIds")
    List<Long> findOpenWishIds(Long viewerId, Collection<Long> wishIds);

    // Удалить все доступы, которые владелец ownerId давал человеку viewerId
    @Modifying
    @Query("""
            delete from WishAccess a
            where a.viewerId = :viewerId
              and a.wishId in (select w.id from Wish w where w.owner.id = :ownerId)
            """)
    int deleteAllGivenBy(Long ownerId, Long viewerId);
}
