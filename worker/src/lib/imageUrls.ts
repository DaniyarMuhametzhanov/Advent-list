// Адреса картинки желания для фронтенда. Если картинки нет — null.
// v=... меняется с каждой новой картинкой. Так браузер не покажет старую картинку из своего кэша
export type ImageUrls = { imageUrl: string | null; thumbUrl: string | null };

export function imageUrls(wish: { id: number; imageKey: string | null }): ImageUrls {
    if (!wish.imageKey) return { imageUrl: null, thumbUrl: null };
    const url = (size: string) => `/api/wishes/${wish.id}/image?size=${size}&v=${wish.imageKey}`;
    return { imageUrl: url('full'), thumbUrl: url('thumb') };
}
