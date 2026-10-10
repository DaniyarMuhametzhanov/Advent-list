package com.adventcalendar.calendar.image;

import org.springframework.boot.context.properties.ConfigurationProperties;

// Настройки из application.properties, которые начинаются со storage.
// storage.access-key → accessKey и т. д.
@ConfigurationProperties(prefix = "storage")
public record StorageProperties(String endpoint, String region, String accessKey, String secretKey, String bucket) {
}
