package com.adventcalendar.calendar.wish;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WishRepository extends JpaRepository<Wish, Long> {

    List<Wish> findAllByOwnerIdOrderByDateAsc(Long ownerId);

    Optional<Wish> findByIdAndOwnerId(Long id, Long ownerId);

    Optional<Wish> findByOwnerIdAndDate(Long ownerId, LocalDate date);
}