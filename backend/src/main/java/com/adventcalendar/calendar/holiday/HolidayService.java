package com.adventcalendar.calendar.holiday;

import com.adventcalendar.calendar.cache.CalendarCaches;
import com.adventcalendar.calendar.user.UserRepository;
import java.time.DateTimeException;
import java.time.MonthDay;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Свои праздники видит и меняет только их владелец
@Service
public class HolidayService {

    private final HolidayRepository repository;
    private final UserRepository userRepository;
    private final CalendarCaches caches;

    public HolidayService(HolidayRepository repository, UserRepository userRepository, CalendarCaches caches) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.caches = caches;
    }

    @Transactional(readOnly = true)
    public List<HolidayResponse> findAll(Long me) {
        return repository.findAllByOwnerIdOrderByMonthAscDayAscIdAsc(me).stream()
                .map(HolidayResponse::from)
                .toList();
    }

    // Добавить ещё один праздник в этот день. В одном дне их может быть несколько
    @Transactional
    public HolidayResponse create(Long me, int month, int day, HolidayRequest request) {
        Holiday holiday = new Holiday(userRepository.getReferenceById(me), toDate(month, day));
        holiday.setTitle(request.title().trim());
        caches.calendarChanged(me); // праздники видны в календаре
        return HolidayResponse.from(repository.save(holiday));
    }

    @Transactional
    public HolidayResponse rename(Long me, Long id, HolidayRequest request) {
        Holiday holiday = findMine(me, id);
        holiday.setTitle(request.title().trim());
        caches.calendarChanged(me);
        return HolidayResponse.from(holiday);
    }

    @Transactional
    public void delete(Long me, Long id) {
        repository.delete(findMine(me, id));
        caches.calendarChanged(me);
    }

    private Holiday findMine(Long me, Long id) {
        return repository.findByIdAndOwnerId(id, me).orElseThrow(() -> new HolidayNotFoundException(id));
    }

    // 29 февраля можно (бывает в високосный год), 31 апреля — нельзя
    private static MonthDay toDate(int month, int day) {
        try {
            return MonthDay.of(month, day);
        } catch (DateTimeException e) {
            throw new BadHolidayDateException(month, day);
        }
    }
}
