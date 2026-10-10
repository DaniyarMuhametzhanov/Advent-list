import type { WishImage } from '../types';

// Картинка желания: настоящая (src) или эмодзи на цветном фоне
export function WishThumb({ img }: { img: WishImage }) {
    if ('src' in img) return <img src={img.src} alt="" />;
    return <span className="ph" style={{ background: img.bg }} aria-hidden="true">{img.emoji}</span>;
}