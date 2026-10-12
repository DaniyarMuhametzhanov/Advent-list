package com.adventcalendar.calendar.holiday;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HolidayRepository extends JpaRepository<Holiday, Long> {

    // Внутри одного дня — в порядке добавления (по id)
    List<Holiday> findAllByOwnerIdOrderByMonthAscDayAscIdAsc(Long ownerId);

    // Праздники человека за один месяц — для календаря, который смотрит друг
    List<Holiday> findAllByOwnerIdAndMonthOrderByDayAscIdAsc(Long ownerId, short month);

    // Ищем сразу по id и владельцу: так чужой праздник не найдётся
    Optional<Holiday> findByIdAndOwnerId(Long id, Long ownerId);
}
