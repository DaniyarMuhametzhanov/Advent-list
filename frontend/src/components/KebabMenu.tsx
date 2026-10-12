import { useEffect, useRef, useState } from 'react';

// Один пункт меню: надпись, действие и «опасный» ли он (красный цвет)
export type MenuItem = { label: string; onClick: () => void; danger?: boolean };

// Кнопка ⋮ и маленькое выпадающее меню под ней. Используется у друзей и у своих праздников
export function KebabMenu({ label, items }: { label: string; items: MenuItem[] }) {
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    // Клик в любом другом месте закрывает меню
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    // Выбрали пункт: закрыть меню и выполнить действие
    function pick(action: () => void) {
        setOpen(false);
        action();
    }

    return (
        <div className="menu" ref={boxRef}
             onKeyDown={e => {
                 // Esc закрывает только меню, а не всё окно вокруг
                 if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
             }}>
            <button type="button" className="kebab" aria-label={label} aria-haspopup="menu" aria-expanded={open}
                    onClick={() => setOpen(o => !o)}>⋮</button>
            {open && (
                <div className="menu-list" role="menu"
                     ref={el => el?.scrollIntoView?.({ block: 'nearest' })}> {/* у нижнего края — прокрутить, чтобы меню было видно */}
                    {items.map(item => (
                        <button type="button" role="menuitem" key={item.label} className={item.danger ? 'danger' : undefined}
                                onClick={() => pick(item.onClick)}>
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
