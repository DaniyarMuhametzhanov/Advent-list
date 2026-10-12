package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.cache.CalendarCaches;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface WishAccessRepository extends JpaRepository<WishAccess, Long> {

    boolean existsByWishIdAndViewerId(Long wishId, Long viewerId);

    long deleteByWishIdAndViewerId(Long wishId, Long viewerId);

    // Все доступы к нескольким желаниям сразу (одним запросом, а не по запросу на каждое желание)
    List<WishAccess> findAllByWishIdIn(Collection<Long> wishIds);

    // Какие дни владельца ownerId открыты человеку viewerId (за все месяцы сразу).
    // Ответ кладём в кэш «openDays». Стирает его CalendarCaches.accessChanged
    @Cacheable(cacheNames = CalendarCaches.OPEN_DAYS, key = "#viewerId + ':' + #ownerId")
    @Query("""
            select a.wishId from WishAccess a, Wish w
            where a.wishId = w.id and a.viewerId = :viewerId and w.owner.id = :ownerId
            """)
    Set<Long> findOpenWishIdsOfOwner(Long viewerId, Long ownerId);

    // Удалить все доступы, которые владелец ownerId давал человеку viewerId
    @Modifying
    @Query("""
            delete from WishAccess a
            where a.viewerId = :viewerId
              and a.wishId in (select w.id from Wish w where w.owner.id = :ownerId)
            """)
    int deleteAllGivenBy(Long ownerId, Long viewerId);
}
