package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "friend_requests")
public class FriendRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "from_user_id", nullable = false)
    private User fromUser;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "to_user_id", nullable = false)
    private User toUser;

    @Enumerated(EnumType.STRING) // в базе хранится текст 'PENDING', а не число 0
    @Column(nullable = false, length = 20)
    private FriendRequestStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected FriendRequest() {
    }

    public FriendRequest(User fromUser, User toUser) {
        this.fromUser = fromUser;
        this.toUser = toUser;
        this.status = FriendRequestStatus.PENDING;
    }

    public void accept() {
        status = FriendRequestStatus.ACCEPTED;
    }

    public void decline() {
        status = FriendRequestStatus.DECLINED;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public User getFromUser() {
        return fromUser;
    }

    public User getToUser() {
        return toUser;
    }

    public FriendRequestStatus getStatus() {
        return status;
    }
}