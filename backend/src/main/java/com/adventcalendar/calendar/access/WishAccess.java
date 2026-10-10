package com.adventcalendar.calendar.access;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

// «Другу viewerId можно смотреть желание wishId»
@Entity
@Table(name = "wish_access")
public class WishAccess {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "wish_id", nullable = false)
    private Long wishId;

    @Column(name = "viewer_id", nullable = false)
    private Long viewerId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected WishAccess() {
    }

    public WishAccess(Long wishId, Long viewerId) {
        this.wishId = wishId;
        this.viewerId = viewerId;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getWishId() {
        return wishId;
    }

    public Long getViewerId() {
        return viewerId;
    }
}
