// Типы данных: какие «формы» у наших объектов.

export type UserId = string;

export type User = {
    id: UserId;
    serverId: number; // id этого человека в базе
    name: string;     // «Анна»
    gen: string;      // родительный падеж: «календарь Анны»
    color: string;    // цвет кружка-аватарки
};

// Картинка желания: либо эмодзи на цветном фоне (фейк), либо загруженный файл.
export type WishImage = { emoji: string; bg: string } | { src: string };

export type Wish = {
    id?: number;
    title: string;
    comment: string;
    img: WishImage;   // большая картинка для окна дня
    thumb: WishImage; // маленькая картинка для клетки календаря
    access: UserId[]; // друзья, которым открыт этот день
    requested?: boolean; // чужой день: я уже попросил доступ и жду ответа
};

// Желания одного человека: ключ — дата '2026-10-08', значение — желание.
export type WishesByDate = Record<string, Wish>;