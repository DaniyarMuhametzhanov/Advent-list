package com.adventcalendar.calendar.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    // Поиск по части имени без учёта регистра, кроме меня самого, не больше 20 человек
    List<User> findTop20ByNameContainingIgnoreCaseAndIdNotOrderByNameAsc(String name, Long excludeId);
}