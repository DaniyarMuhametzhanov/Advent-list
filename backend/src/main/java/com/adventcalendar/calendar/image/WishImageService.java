package com.adventcalendar.calendar.image;

import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import com.adventcalendar.calendar.wish.WishRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class WishImageService {

    private final WishRepository wishRepository;
    private final WishAccessRepository accessRepository;
    private final ImageProcessor processor;
    private final ImageStorage storage;

    public WishImageService(WishRepository wishRepository, WishAccessRepository accessRepository,
                            ImageProcessor processor, ImageStorage storage) {
        this.wishRepository = wishRepository;
        this.accessRepository = accessRepository;
        this.processor = processor;
        this.storage = storage;
    }

    // Загрузить картинку к своему желанию. Старая картинка (если была) удаляется
    @Transactional
    public void upload(Long me, Long wishId, MultipartFile file) {
        Wish wish = wishRepository.findByIdAndOwnerId(wishId, me)
                .orElseThrow(() -> new WishNotFoundException(wishId));
        ProcessedImage image = processor.process(file);

        String oldKey = wish.getImageKey();
        String newKey = UUID.randomUUID().toString(); // случайное имя: его нельзя угадать
        storage.save(newKey, image);
        wish.setImageKey(newKey);
        if (oldKey != null) {
            storage.delete(oldKey);
        }
    }

    // Отдать картинку. Главное правило этапа: только владельцу или другу, которому открыт день
    @Transactional(readOnly = true)
    public byte[] download(Long viewerId, Long wishId, boolean thumb) {
        Wish wish = wishRepository.findById(wishId)
                .orElseThrow(() -> new WishNotFoundException(wishId));
        boolean isOwner = wish.getOwner().getId().equals(viewerId);
        // Нет доступа — отвечаем 404, как будто картинки нет вовсе. Не подсказываем, что она существует
        if (!isOwner && !accessRepository.existsByWishIdAndViewerId(wishId, viewerId)) {
            throw new WishNotFoundException(wishId);
        }
        if (wish.getImageKey() == null) {
            throw new WishNotFoundException(wishId);
        }
        return storage.load(wish.getImageKey(), thumb);
    }
}
