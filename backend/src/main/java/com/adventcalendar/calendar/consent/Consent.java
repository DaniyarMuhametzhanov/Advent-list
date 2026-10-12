package com.adventcalendar.calendar.consent;

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
import jakarta.persistence.Table;
import java.time.Instant;

// Запись «человек согласился с документом такой-то версии в такое-то время».
// Не меняется: при новой версии документа добавляется новая запись
@Entity
@Table(name = "consents")
public class Consent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ConsentType type;

    @Column(name = "document_version", nullable = false, length = 20)
    private String documentVersion;

    @Column(name = "accepted_at", nullable = false, updatable = false)
    private Instant acceptedAt;

    protected Consent() {
    }

    public Consent(User user, ConsentType type, String documentVersion, Instant acceptedAt) {
        this.user = user;
        this.type = type;
        this.documentVersion = documentVersion;
        this.acceptedAt = acceptedAt;
    }

    public Long getId() {
        return id;
    }

    public ConsentType getType() {
        return type;
    }

    public String getDocumentVersion() {
        return documentVersion;
    }

    public Instant getAcceptedAt() {
        return acceptedAt;
    }
}
