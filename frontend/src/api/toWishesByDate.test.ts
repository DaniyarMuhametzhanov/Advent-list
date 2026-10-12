import { describe, expect, it } from 'vitest';
import { toFriendWishes, toWishesByDate } from './toWishesByDate';

describe('toFriendWishes', () => {
    it('закрытый день остаётся закрытым и без текста', () => {
        const result = toFriendWishes([{
            wishId: 7, date: '2026-10-15', open: false, requested: true,
            title: null, comment: null, imageUrl: null, thumbUrl: null, holidays: [],
        }], 'boris');

        const day = result['2026-10-15'];
        expect(day.access).toEqual([]);   // Борису не открыт
        expect(day.requested).toBe(true);
        expect(day.title).toBe('');
        expect(day.thumb).toEqual({ emoji: '🎁', bg: '#FBE4EC' }); // вместо картинки — подарок
    });

    it('открытый день: access содержит меня, картинка с сервера', () => {
        const result = toFriendWishes([{
            wishId: 7, date: '2026-10-15', open: true, requested: false,
            title: 'Шарф', comment: 'Синий', imageUrl: '/api/wishes/7/image?size=full',
            thumbUrl: '/api/wishes/7/image?size=thumb', holidays: ['День рождения мамы'],
        }], 'boris');

        const day = result['2026-10-15'];
        expect(day.access).toEqual(['boris']);
        expect(day.title).toBe('Шарф');
        expect(day.thumb).toEqual({ src: '/api/wishes/7/image?size=thumb' });
        expect(day.holidays).toEqual(['День рождения мамы']); // праздники хозяина в открытом дне
    });
});

describe('toWishesByDate', () => {
    it('раскладывает мои желания по датам и переводит id друзей', () => {
        const result = toWishesByDate([{
            id: 1, date: '2026-10-05', title: 'Книга', comment: null,
            access: [2], imageUrl: null, thumbUrl: null,
        }]);

        expect(result['2026-10-05'].comment).toBe(''); // null → пустая строка
        expect(result['2026-10-05'].access).toEqual(['boris']); // id 2 в базе — это Борис
    });
});
