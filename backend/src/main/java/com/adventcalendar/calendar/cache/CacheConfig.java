package com.adventcalendar.calendar.cache;

import java.time.Duration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;

// @EnableCaching включает @Cacheable: без него Spring просто не замечает эти аннотации
@Configuration
@EnableCaching
public class CacheConfig {

    // Кэш теперь живёт не в памяти сервера, а в отдельной программе Redis.
    // Адрес Redis Spring берёт из spring.data.redis.* в application.properties
    @Bean
    CacheManager cacheManager(RedisConnectionFactory redis) {
        RedisCacheConfiguration settings = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(10)); // страховка: запись живёт максимум 10 минут
        return RedisCacheManager.builder(redis)
                .cacheDefaults(settings)
                // Записать или стереть кэш — только после коммита, как и с Caffeine
                .transactionAware()
                .build();
    }
}
