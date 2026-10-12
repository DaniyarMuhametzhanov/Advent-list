package com.adventcalendar.calendar.holiday;

import com.adventcalendar.calendar.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.MonthDay;

// Свой праздник человека. Без года: «15 марта — день рождения мамы» каждый год
@Entity
@Table(name = "holidays")
public class Holiday {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(nullable = false)
    private short month;

    @Column(nullable = false)
    private short day;

    @Column(nullable = false, length = 40)
    private String title;

    protected Holiday() {
    }

    public Holiday(User owner, MonthDay date) {
        this.owner = owner;
        this.month = (short) date.getMonthValue();
        this.day = (short) date.getDayOfMonth();
    }

    public Long getId() {
        return id;
    }

    public MonthDay getDate() {
        return MonthDay.of(month, day);
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }
}
