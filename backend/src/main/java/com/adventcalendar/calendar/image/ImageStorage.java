package com.adventcalendar.calendar.image;

import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;

// Всё общение с хранилищем картинок — в одном месте.
// У каждой картинки два файла: большой (full) и маленькое превью (thumb)
@Component
public class ImageStorage {

    private final S3Client s3;
    private final String bucket;

    public ImageStorage(S3Client s3, StorageProperties props) {
        this.s3 = s3;
        this.bucket = props.bucket();
    }

    public void save(String imageKey, ProcessedImage image) {
        put(fullKey(imageKey), image.full());
        put(thumbKey(imageKey), image.thumb());
    }

    public byte[] load(String imageKey, boolean thumb) {
        String key = thumb ? thumbKey(imageKey) : fullKey(imageKey);
        return s3.getObjectAsBytes(b -> b.bucket(bucket).key(key)).asByteArray();
    }

    public void delete(String imageKey) {
        s3.deleteObject(b -> b.bucket(bucket).key(fullKey(imageKey)));
        s3.deleteObject(b -> b.bucket(bucket).key(thumbKey(imageKey)));
    }

    private void put(String key, byte[] bytes) {
        s3.putObject(b -> b.bucket(bucket).key(key).contentType("image/jpeg"), RequestBody.fromBytes(bytes));
    }

    private static String fullKey(String imageKey) {
        return "wishes/" + imageKey + ".jpg";
    }

    private static String thumbKey(String imageKey) {
        return "wishes/" + imageKey + "-thumb.jpg";
    }
}
