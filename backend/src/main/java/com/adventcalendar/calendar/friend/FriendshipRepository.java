package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.user.User;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    boolean existsByUserAIdAndUserBId(Long userAId, Long userBId);

    long deleteByUserAIdAndUserBId(Long userAId, Long userBId);

    // Мои друзья: я могу стоять и в user_a, и в user_b, поэтому смотрим обе стороны
    @Query("""
            select u from User u
            where u.id in (select f.userBId from Friendship f where f.userAId = :userId)
               or u.id in (select f.userAId from Friendship f where f.userBId = :userId)
            order by u.name
            """)
    List<User> findFriendsOf(Long userId);
}