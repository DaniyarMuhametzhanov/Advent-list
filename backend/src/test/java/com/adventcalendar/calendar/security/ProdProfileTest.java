package com.adventcalendar.calendar.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

// Запускаем сервер так, как он будет работать на настоящем сервере: с профилем prod.
// Пароли в prod берутся из переменных окружения, здесь подставляем тестовые
@SpringBootTest(properties = {"DB_PASSWORD=test", "STORAGE_SECRET_KEY=test"})
@ActiveProfiles("prod")
@Import(TestcontainersConfiguration.class)
class ProdProfileTest {

    @Autowired UserRepository userRepository;

    @Test
    void demoUsersAreRemovedInProd() {
        // Миграция V2 создала Анну, Бориса и Вику, а db/prod/afterMigrate.sql их удалил
        assertThat(userRepository.findByEmail("anna@example.com")).isEmpty();
        assertThat(userRepository.findByEmail("boris@example.com")).isEmpty();
        assertThat(userRepository.findByEmail("vika@example.com")).isEmpty();
    }
}
