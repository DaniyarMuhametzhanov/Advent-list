// Проверка подписи Telegram (initData) без сервера: только функция verifyInitData
import { describe, expect, it } from 'vitest';
import { MAX_AGE_SECONDS, signInitData, verifyInitData } from '../src/auth/telegram';

const TOKEN = '123456:test-token';
const NOW = 1_800_000_000;
const user = JSON.stringify({ id: 42, first_name: 'Анна', username: 'anna' });

describe('verifyInitData', () => {
    it('принимает данные, подписанные токеном бота', async () => {
        const initData = await signInitData({ user, auth_date: String(NOW), query_id: 'q1' }, TOKEN);
        expect(await verifyInitData(initData, TOKEN, NOW)).toEqual({ id: 42, first_name: 'Анна', username: 'anna' });
    });

    it('не принимает данные, подписанные другим ботом', async () => {
        const initData = await signInitData({ user, auth_date: String(NOW) }, '999:other-bot');
        expect(await verifyInitData(initData, TOKEN, NOW)).toBeNull();
    });

    it('не принимает подменённого человека: подпись перестаёт сходиться', async () => {
        const initData = await signInitData({ user, auth_date: String(NOW) }, TOKEN);
        const forged = initData.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
        expect(forged).not.toBe(initData);
        expect(await verifyInitData(forged, TOKEN, NOW)).toBeNull();
    });

    it('не принимает старые данные', async () => {
        const initData = await signInitData({ user, auth_date: String(NOW - MAX_AGE_SECONDS - 1) }, TOKEN);
        expect(await verifyInitData(initData, TOKEN, NOW)).toBeNull();
    });

    it('не принимает данные без подписи', async () => {
        expect(await verifyInitData(`user=${encodeURIComponent(user)}&auth_date=${NOW}`, TOKEN, NOW)).toBeNull();
        expect(await verifyInitData('', TOKEN, NOW)).toBeNull();
    });
});
