package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.wish.Wish;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

// Запрос «откройте мне этот день». Живёт, пока владелец не ответил
@Entity
@Table(name = "access_requests")
public class AccessRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "wish_id", nullable = false)
    private Wish wish;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "from_user_id", nullable = false)
    private User fromUser;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AccessRequest() {
    }

    public AccessRequest(Wish wish, User fromUser) {
        this.wish = wish;
        this.fromUser = fromUser;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Wish getWish() {
        return wish;
    }

    public User getFromUser() {
        return fromUser;
    }
}
