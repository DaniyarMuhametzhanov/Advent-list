# Этап 1. Первый сервер

## 🔹 Что делаем и зачем

Запускаем первый сервер на Java (**Spring Boot**). У него будет один адрес (**эндпоинт**) `/api/health`.
Если открыть его в браузере, сервер ответит «я живой»: `{"status":"ok"}`.

Это как проверить, что в новой квартире включается свет, до того как завозить мебель.
Мы убеждаемся, что Java 21, сборщик проекта (**Maven**) и Spring Boot работают. Дальше всё будем добавлять на этот сервер.

## 🔹 Шаг 1. Создай заготовку проекта

Открой https://start.spring.io и выбери:

- Project: **Maven**, Language: **Java**
- Spring Boot: **3.5.x** (не 4.x — в плане у нас Boot 3)
- Group: `com.wishlist`
- Artifact: `backend`
- Package name: `com.wishlist.calendar`
- Packaging: **Jar**, Java: **21**
- Справа **Add Dependencies** → **Spring Web**

Нажми **Generate** — скачается `backend.zip`.

Что это за поля:
- **Group** — «фамилия» проекта, обычно перевёрнутый домен.
- **Artifact** — имя самого проекта.
- **Package** — папка, где лежит Java-код (**пакет**).
- **Spring Web** — библиотека (**зависимость**), которая даёт встроенный веб-сервер Tomcat и контроллеры.

## 🔹 Шаг 2. Положи в проект

1. Распакуй архив.
2. Всё содержимое папки `backend` из архива перенеси в `advent-list\backend`.
3. Удали `backend\.gitkeep` — папка больше не пустая, он не нужен.

Внутри `backend` должны быть:

```
backend/
├── .mvn/              # настройки Maven Wrapper
├── src/
│   ├── main/java/...  # код приложения
│   └── test/java/...  # тесты
├── mvnw, mvnw.cmd     # Maven Wrapper: запускает Maven без установки
└── pom.xml            # описание проекта и его зависимостей
```

## 🔹 Шаг 3. Открой в IntelliJ

1. **File → Open** → выбери `advent-list\backend\pom.xml` → **Open as Project**.
2. Подожди, пока внизу закончится загрузка библиотек (**зависимостей**).
3. **File → Project Structure → SDK** — должна стоять **21**.

## 🔹 Шаг 4. Напиши эндпоинт

Рядом с `BackendApplication.java` создай пакет `health`, в нём файл `HealthController.java`:

```java
package com.wishlist.calendar.health;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
```

По шагам:
1. `@RestController` — этот класс отвечает на запросы из сети (**контроллер**). Ответ сам превращается в JSON.
2. `@RequestMapping("/api")` — все адреса в классе начинаются с `/api`.
3. `@GetMapping("/health")` — метод сработает, когда кто-то откроет `/api/health` (**GET-запрос** = «дай мне данные»).
4. `Map.of("status", "ok")` — пара «ключ → значение», Spring превращает её в `{"status":"ok"}` (**сериализация**).

Значки `@...` — это пометки для Spring (**аннотации**). Они говорят фреймворку, что делать с классом или методом.

## 🔹 Шаг 5. Запусти

Открой `BackendApplication.java` и нажми зелёный ▶ рядом с `main`.
В консоли должно появиться `Tomcat started on port 8080`.

Другой способ, из терминала:

```
cd backend
.\mvnw.cmd spring-boot:run
```

## 🔹 Шаг 6. Проверь

Открой в браузере http://localhost:8080/api/health

Должно быть:

```
{"status":"ok"}
```

Частые ошибки:
- `Port 8080 was already in use` — сервер уже запущен в другом окне. Останови его.
- Ошибка про версию Java (`release version 21 not supported`) — IntelliJ или терминал берут не ту Java. Проверь SDK (шаг 3) и `JAVA_HOME` (этап 0).

## 🔹 Шаг 7. Сохрани в Git

Останови сервер (красный ■), затем в терминале в папке `advent-list`:

```
git add .
git status
git commit -m "Этап 1: первый сервер и /api/health"
```

В `git status` не должно быть папки `target` — это собранные файлы, их скрывает `.gitignore`.

## Главное, что нужно запомнить

- Spring Boot — Java-приложение со встроенным веб-сервером (Tomcat).
- Контроллер связывает адрес (`/api/health`) с методом Java.
- Объект, который вернул метод, Spring сам превращает в JSON.
- `mvnw` — Maven Wrapper: проект собирается одинаково на любом компьютере.
