package com.adventcalendar.calendar.cache;

import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

// Названия кэшей и «ластики»: какой кэш стереть, когда что-то поменялось.
// Ключи здесь должны совпадать с key = "..." в @Cacheable
@Component
public class CalendarCaches {

    // Все дни владельца, как их видит он сам. Ключ: id владельца
    public static final String CALENDARS = "calendars";
    // Какие дни владельца открыты смотрящему. Ключ: "смотрящий:владелец"
    public static final String OPEN_DAYS = "openDays";
    // Друзья ли двое. Ключ: "меньший id:больший id"
    public static final String FRIENDS = "friends";

    private final CacheManager cacheManager;

    public CalendarCaches(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    // Поменялось желание, картинка или праздник владельца
    public void calendarChanged(Long ownerId) {
        evict(CALENDARS, ownerId);
    }

    // Владелец открыл или закрыл свой день смотрящему
    public void accessChanged(Long ownerId, Long viewerId) {
        evict(OPEN_DAYS, viewerId + ":" + ownerId);
    }

    // Двое стали друзьями или перестали. При удалении из друзей пропадают и доступы в обе стороны
    public void friendshipChanged(Long a, Long b) {
        evict(FRIENDS, Math.min(a, b) + ":" + Math.max(a, b));
        accessChanged(a, b);
        accessChanged(b, a);
    }

    private void evict(String cacheName, Object key) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) {
            cache.evict(key);
        }
    }
}
