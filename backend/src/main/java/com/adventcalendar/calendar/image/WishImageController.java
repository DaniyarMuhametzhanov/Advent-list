package com.adventcalendar.calendar.image;

import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.wish.WishResponse;
import com.adventcalendar.calendar.wish.WishService;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/wishes/{id}/image")
public class WishImageController {

    private final WishImageService imageService;
    private final WishService wishService;

    public WishImageController(WishImageService imageService, WishService wishService) {
        this.imageService = imageService;
        this.wishService = wishService;
    }

    // POST /api/wishes/5/image — тело запроса: форма с файлом в поле "file"
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public WishResponse upload(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id,
                               @RequestParam("file") MultipartFile file) {
        imageService.upload(me.id(), id, file);
        return wishService.findById(me.id(), id); // желание уже с адресами новой картинки
    }

    // GET /api/wishes/5/image?size=thumb — сама картинка (байты JPEG)
    @GetMapping
    public ResponseEntity<byte[]> download(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id,
                                           @RequestParam(defaultValue = "full") String size) {
        byte[] bytes = imageService.download(me.id(), id, "thumb".equals(size));
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                // Браузер может 10 минут держать картинку у себя, но только для этого человека (private)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePrivate())
                .body(bytes);
    }
}
