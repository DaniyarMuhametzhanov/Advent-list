// Конфетти на <canvas>. Логика перенесена из макета почти без изменений.
const COLORS = ['#C7356E', '#F4C04E', '#1F8F74', '#2C6FD1', '#F7B9CF', '#BFE6D8'];

type Part = {
    x: number; y: number; vx: number; vy: number; s: number; r: number; vr: number;
    c: string; round: boolean; life: number; max: number;
};

export function burst(canvas: HTMLCanvasElement, x: number, y: number) {
    // Человек попросил систему поменьше анимаций → не показываем конфетти
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let parts: Part[] = [];
    for (let i = 0; i < 120; i++) {
        const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 10;
        parts.push({
            x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, s: 5 + Math.random() * 6,
            r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[i % COLORS.length],
            round: i % 4 === 0, life: 0, max: 70 + Math.random() * 45,
        });
    }

    // Один кадр анимации: сдвинуть частицы и нарисовать заново
    const tick = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        parts = parts.filter(p => p.life < p.max);
        for (const p of parts) {
            p.life++; p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
            ctx.globalAlpha = Math.min(1, (p.max - p.life) / 20);
            ctx.fillStyle = p.c;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.r);
            ctx.scale(1, Math.cos(p.life * 0.2));
            if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2); ctx.fill(); }
            else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
            ctx.restore();
        }
        if (parts.length) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}