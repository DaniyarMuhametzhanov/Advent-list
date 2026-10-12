package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.cache.CalendarCaches;
import com.adventcalendar.calendar.holiday.Holiday;
import com.adventcalendar.calendar.holiday.HolidayRepository;
import java.time.MonthDay;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Календарь владельца целиком, как его видит сам владелец: все дни открыты.
// Ответ не зависит от того, КТО смотрит, поэтому его можно положить в кэш один раз для всех.
// Права смотрящего применяет WishService уже ПОСЛЕ кэша
@Service
public class OwnerCalendarService {

    private final WishRepository wishRepository;
    private final HolidayRepository holidayRepository;

    public OwnerCalendarService(WishRepository wishRepository, HolidayRepository holidayRepository) {
        this.wishRepository = wishRepository;
        this.holidayRepository = holidayRepository;
    }

    // Первый вызов для владельца идёт в базу, следующие берут готовый ответ из кэша «calendars»
    @Cacheable(cacheNames = CalendarCaches.CALENDARS, key = "#ownerId")
    @Transactional(readOnly = true)
    public List<CalendarDayResponse> allDays(Long ownerId) {
        // Свои праздники владельца по датам: { 03-25: ["День рождения Влада"] }. Без года — каждый год
        Map<MonthDay, List<String>> holidays = holidayRepository
                .findAllByOwnerIdOrderByMonthAscDayAscIdAsc(ownerId).stream()
                .collect(Collectors.groupingBy(Holiday::getDate,
                        Collectors.mapping(Holiday::getTitle, Collectors.toList())));
        return wishRepository.findAllByOwnerIdOrderByDateAsc(ownerId).stream()
                .map(wish -> CalendarDayResponse.open(wish,
                        holidays.getOrDefault(MonthDay.from(wish.getDate()), List.of())))
                .toList();
    }
}
