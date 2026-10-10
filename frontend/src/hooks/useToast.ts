import { useRef, useState } from 'react';

// Хук: хранит текст уведомления и сам прячет его через 2,4 секунды
export function useToast() {
    const [text, setText] = useState('');
    const [visible, setVisible] = useState(false);
    const timer = useRef<number | undefined>(undefined);

    function showToast(message: string) {
        setText(message);
        setVisible(true);
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setVisible(false), 2400);
    }

    return { text, visible, showToast };
}