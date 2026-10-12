package com.adventcalendar.calendar;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

// Для тестов поднимаем свои, «одноразовые» PostgreSQL и MinIO в Docker.
// Они создаются перед первым тестом и удаляются после последнего.
// Твоя база из docker-compose при этом не трогается
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    // @ServiceConnection: Spring сам возьмёт у контейнера адрес, логин и пароль базы
    // и подставит их вместо spring.datasource.* из application.properties
    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:17"));
    }

    @Bean
    MinIOContainer minio() {
        // Тот же образ, что в docker-compose.yml. Говорим Testcontainers, что это «тот самый» MinIO
        DockerImageName image = DockerImageName.parse("pgsty/minio:RELEASE.2026-08-04T00-00-00Z")
                .asCompatibleSubstituteFor("minio/minio");
        return new MinIOContainer(image);
    }

    // Для MinIO готового @ServiceConnection нет, поэтому настройки storage.* подставляем сами
    @Bean
    DynamicPropertyRegistrar storageProperties(MinIOContainer minio) {
        return registry -> {
            registry.add("storage.endpoint", minio::getS3URL);
            registry.add("storage.access-key", minio::getUserName);
            registry.add("storage.secret-key", minio::getPassword);
        };
    }
}
