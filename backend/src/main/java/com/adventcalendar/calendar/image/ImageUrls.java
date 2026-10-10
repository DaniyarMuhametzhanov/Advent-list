package com.adventcalendar.calendar.image;

import com.adventcalendar.calendar.wish.Wish;

// Адреса картинки желания для фронтенда. Если картинки нет — null
public final class ImageUrls {

    private ImageUrls() {
    }

    public static String full(Wish wish) {
        return url(wish, "full");
    }

    public static String thumb(Wish wish) {
        return url(wish, "thumb");
    }

    private static String url(Wish wish, String size) {
        if (wish.getImageKey() == null) {
            return null;
        }
        // v=... меняется с каждой новой картинкой. Так браузер не покажет старую картинку из своего кэша
        return "/api/wishes/" + wish.getId() + "/image?size=" + size + "&v=" + wish.getImageKey();
    }
}
