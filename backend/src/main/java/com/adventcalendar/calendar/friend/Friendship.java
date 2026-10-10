package com.adventcalendar.calendar.friend;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "friendships")
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_a_id", nullable = false)
    private Long userAId;

    @Column(name = "user_b_id", nullable = false)
    private Long userBId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Friendship() {
    }

    // Дружба Анны (1) с Борисом (2) и Бориса с Анной — одна и та же запись (1, 2)
    public static Friendship between(Long x, Long y) {
        Friendship friendship = new Friendship();
        friendship.userAId = Math.min(x, y);
        friendship.userBId = Math.max(x, y);
        return friendship;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getUserAId() {
        return userAId;
    }

    public Long getUserBId() {
        return userBId;
    }
}