type Props = { text: string; visible: boolean };

export function Toast({ text, visible }: Props) {
    return (
        <div className={visible ? 'toast on' : 'toast'} role="status" aria-live="polite">
            {text}
        </div>
    );
}