package com.adventcalendar.calendar.security;

import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

// Ограничение попыток входа (rate limit). Счётчики лежат в Redis:
//   login:ip:<адрес>      — сколько попыток входа и регистрации было с этого адреса
//   login:fails:<email>   — сколько раз подряд ошиблись паролем от этого email
// У каждого счётчика есть «таймер» (TTL): когда окно закончится, Redis сам его сотрёт
@Service
public class LoginRateLimiter {

    private final StringRedisTemplate redis;
    private final int maxAttemptsPerIp;
    private final int maxFailsPerEmail;
    private final Duration window;

    public LoginRateLimiter(StringRedisTemplate redis,
                            @Value("${security.login.max-attempts-per-ip}") int maxAttemptsPerIp,
                            @Value("${security.login.max-fails-per-email}") int maxFailsPerEmail,
                            @Value("${security.login.window}") Duration window) {
        this.redis = redis;
        this.maxAttemptsPerIp = maxAttemptsPerIp;
        this.maxFailsPerEmail = maxFailsPerEmail;
        this.window = window;
    }

    // Вызываем ДО проверки пароля. email == null — это регистрация, там считаем только адрес
    public void checkAllowed(String ip, String email) {
        String ipKey = "login:ip:" + ip;
        if (increment(ipKey) > maxAttemptsPerIp) {
            throw new TooManyAttemptsException(timeLeft(ipKey));
        }
        if (email != null) {
            String failsKey = "login:fails:" + email;
            String fails = redis.opsForValue().get(failsKey);
            if (fails != null && Long.parseLong(fails) >= maxFailsPerEmail) {
                throw new TooManyAttemptsException(timeLeft(failsKey));
            }
        }
    }

    public void loginFailed(String email) {
        increment("login:fails:" + email);
    }

    // Вошёл правильно — прошлые ошибки забываем
    public void loginSucceeded(String email) {
        redis.delete("login:fails:" + email);
    }

    // +1 к счётчику. Первая попытка в окне заводит таймер
    private long increment(String key) {
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1) {
            redis.expire(key, window);
        }
        return count == null ? 0 : count;
    }

    private Duration timeLeft(String key) {
        Long seconds = redis.getExpire(key, TimeUnit.SECONDS);
        return seconds == null || seconds < 0 ? window : Duration.ofSeconds(seconds);
    }
}
