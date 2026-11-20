// Общие вопросы про дружбу. Пара хранится один раз: меньший id всегда в user_a_id
export const pair = (x: number, y: number) => [Math.min(x, y), Math.max(x, y)] as const;

export async function areFriends(db: D1Database, x: number, y: number) {
    const [a, b] = pair(x, y);
    return (await db.prepare('SELECT 1 AS ok FROM friendships WHERE user_a_id = ? AND user_b_id = ?')
        .bind(a, b).first('ok')) !== null;
}
