# ===== Шаг 1: сборка. Здесь есть Maven и полный JDK =====
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# Тесты здесь не запускаем: им нужен Docker (Testcontainers), а внутри сборки его нет.
# Тесты запускает GitHub Actions отдельным шагом.
# --mount=type=cache: скачанные библиотеки Maven сохраняются между сборками
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests package

# ===== Шаг 2: запуск. Только JRE и готовый jar, без Maven и исходников =====
FROM eclipse-temurin:21-jre
WORKDIR /app
# Отдельный пользователь без прав администратора
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build /app/target/*.jar app.jar
USER app
EXPOSE 8080
# MaxRAMPercentage=75: Java берёт до 75% памяти, которую дали контейнеру
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
