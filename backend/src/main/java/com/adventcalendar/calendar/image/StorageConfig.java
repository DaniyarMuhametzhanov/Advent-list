package com.adventcalendar.calendar.image;

import java.net.URI;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;

@Configuration
@EnableConfigurationProperties(StorageProperties.class)
public class StorageConfig {

    // Клиент S3: через него сервер кладёт и достаёт файлы из MinIO
    @Bean
    public S3Client s3Client(StorageProperties props) {
        return S3Client.builder()
                .endpointOverride(URI.create(props.endpoint()))  // не Amazon, а наш MinIO
                .region(Region.of(props.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(props.accessKey(), props.secretKey())))
                .forcePathStyle(true) // адрес вида localhost:9000/корзина/файл — так понимает MinIO
                // Контрольные суммы считаем только там, где их требует сам протокол S3.
                // Так клиент от Amazon точно дружит с другими S3-хранилищами
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .build();
    }

    // При старте сервера: если «корзины» для картинок ещё нет, создаём её
    @Bean
    public ApplicationRunner createBucket(S3Client s3, StorageProperties props) {
        return args -> {
            try {
                s3.headBucket(b -> b.bucket(props.bucket()));
            } catch (NoSuchBucketException e) {
                s3.createBucket(b -> b.bucket(props.bucket()));
            }
        };
    }
}
