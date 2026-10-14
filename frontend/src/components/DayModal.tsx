import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { UserId, Wish, WishImage } from '../types';
import { USERS } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { officialHoliday } from '../data/holidays';
import { burst } from '../lib/confetti';
import type { HolidayDto } from '../api/holidays';
import { Avatar } from './Avatar';
import { KebabMenu } from './KebabMenu';
import { WishThumb } from './WishThumb';

type Props = {
    date: string;
    me: UserId;
    owner: UserId;
    wish?: Wish;
    myFriends: UserId[];
    alreadyAsked: boolean;                      // я уже просил доступ к этому дню?
    origin: { x: number; y: number } | null;    // откуда лететь конфетти (центр клетки)
    onClose: () => void;
    onSave: (date: string, wish: Wish, file: File | null) => void; // file — новая картинка, если выбрали
    onDelete: (date: string) => void;
    onSetAccess: (date: string, friend: UserId, open: boolean) => void;
    onRequestAccess: (date: string) => void;
    onToast: (text: string) => void;
    myHolidays?: HolidayDto[];                                 // мои праздники в этот день (только в своём календаре)
    onAddHoliday: (date: string, title: string) => void;
    onRenameHoliday: (holiday: HolidayDto, title: string) => void;
    onDeleteHoliday: (holiday: HolidayDto) => void;
};

export function DayModal(props: Props) {
    const { date, me, owner, wish, onClose } = props;
    const isOwn = owner === me;
    const isLocked = !isOwn && !!wish && !wish.access.includes(me);

    const dialogRef = useRef<HTMLDialogElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const confettiDone = useRef(false);

    // При появлении окна: открыть <dialog> и запустить конфетти
    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
        // В режиме разработки React (StrictMode) запускает эффект дважды — защищаемся флагом
        if (!confettiDone.current && props.origin && !isLocked && canvasRef.current) {
            confettiDone.current = true;
            burst(canvasRef.current, props.origin.x, props.origin.y);
        }
        // пустой список = выполнить один раз, когда окно появилось
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    let content;
    if (isOwn) content = <OwnDay {...props} />;
    else if (!isLocked && wish) content = <ReadOnlyDay wish={wish} />;
    else content = <LockedDay owner={owner} asked={props.alreadyAsked} onAsk={() => props.onRequestAccess(date)} />;

    return (
        <dialog ref={dialogRef} aria-labelledby="dlgTitle"
                onClose={onClose}                                         // закрыли клавишей Esc
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}>  {/* клик по тёмному фону */}
            <div className="dlg pop">
                <div className="dlg-head">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 id="dlgTitle">{formatDate(date)}</h2>
                        {officialHoliday(date) && <p className="hol-tag">🎉 {officialHoliday(date)}</p>}
                        {/* В чужом открытом дне — праздники хозяина. В своём они ниже, в списке с меню ⋮ */}
                        {!isOwn && wish?.holidays?.map((h, i) => <p className="hol-tag" key={i}>🎂 {h}</p>)}
                    </div>
                    <button className="x" onClick={onClose} aria-label="Закрыть">✕</button>
                </div>
                {content}
            </div>
            <canvas ref={canvasRef} className="fx" />
        </dialog>
    );
}

// Те же правила, что на сервере: проверяем заранее, чтобы не гонять большой файл зря
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 МБ
const NO_IMAGE: WishImage = { emoji: '🎁', bg: '#FBE4EC' };

/* ---------- Свой день: форма ---------- */
function OwnDay({ date, wish, myFriends, onSave, onDelete, onSetAccess, onToast, myHolidays = [], onAddHoliday, onRenameHoliday, onDeleteHoliday }: Props) {
    const [title, setTitle] = useState(wish?.title ?? '');
    const [comment, setComment] = useState(wish?.comment ?? '');
    const [draftImg, setDraftImg] = useState<WishImage | null>(null);   // предпросмотр выбранной картинки
    const [draftFile, setDraftFile] = useState<File | null>(null);      // сам файл: уйдёт на сервер при «Сохранить»
    const [draftAccess, setDraftAccess] = useState<UserId[]>([]); // доступ для ещё не сохранённого желания
    const [showError, setShowError] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const img = draftImg ?? wish?.img;
    const access = wish ? wish.access : draftAccess;

    function readFile(file: File | undefined) {
        if (!file) return;
        if (!IMAGE_TYPES.includes(file.type)) { onToast('Подойдут картинки JPG, PNG или GIF'); return; }
        if (file.size > MAX_IMAGE_SIZE) { onToast('Картинка больше 5 МБ'); return; }
        setDraftFile(file);
        // Временный адрес файла внутри браузера: чтобы показать картинку до отправки на сервер
        setDraftImg({ src: URL.createObjectURL(file) });
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        setDragOver(false);
        readFile(e.dataTransfer.files[0]);
    }

    function toggleAccess(friend: UserId, open: boolean) {
        if (wish) onSetAccess(date, friend, open);  // у существующего желания — сразу
        else setDraftAccess(list => open ? [...list, friend] : list.filter(id => id !== friend));
    }

    function save() {
        if (!title.trim()) { setShowError(true); return; }
        onSave(date, {
            title: title.trim(),
            comment: comment.trim(),
            img: img ?? NO_IMAGE,
            thumb: img ?? NO_IMAGE,
            access,
        }, draftFile);
    }

    return (
        <>
            <MyHolidays date={date} holidays={myHolidays}
                        onAdd={onAddHoliday} onRename={onRenameHoliday} onDelete={onDeleteHoliday} />

            <div>
                <div className={'preview drop' + (dragOver ? ' over' : '')}
                     onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                     onDragLeave={() => setDragOver(false)}
                     onDrop={onDrop}>
                    {img ? <WishThumb img={img} /> : 'Перетащите картинку сюда'}
                </div>
                <div className="upload" style={{ marginTop: 10 }}>
                    <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>Загрузить</button>
                    <span className="hint">или перетащите файл в рамку. JPG, PNG или GIF, до 5 МБ</span>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif" hidden onChange={e => readFile(e.target.files?.[0])} />
                </div>
            </div>

            <label className="lbl" htmlFor="fTitle">Название подарка
                <input className="field" id="fTitle" maxLength={60} placeholder="Например, наушники"
                       value={title} onChange={e => { setTitle(e.target.value); setShowError(false); }} />
            </label>
            {showError && <p className="err">Введите название подарка.</p>}

            <label className="lbl" htmlFor="fComment">Комментарий / описание
                <textarea className="field" id="fComment" placeholder="Размер, цвет, ссылка, пожелания"
                          value={comment} onChange={e => setComment(e.target.value)} />
            </label>

            <div className="access">
                <h3>Кто видит этот день</h3>
                {myFriends.length === 0 && <p className="hint">Добавьте друзей, чтобы открыть им этот день.</p>}
                {myFriends.map(f => (
                    <div className="row" key={f}>
                        <Avatar user={USERS[f]} large />
                        <label className="grow" htmlFor={'acc-' + f}>{USERS[f].name}</label>
                        <span className="sw">
              <input type="checkbox" id={'acc-' + f} checked={access.includes(f)}
                     onChange={e => toggleAccess(f, e.target.checked)} />
              <span />
            </span>
                    </div>
                ))}
                {myFriends.length > 0 && (
                    <p className="hint">{wish ? 'Доступ меняется сразу, без сохранения.' : 'Доступ включится после сохранения.'}</p>
                )}
            </div>

            <div className="foot">
                <button className="btn" onClick={save}>Сохранить</button>
                {wish && (
                    <button className="btn danger sp"
                            onClick={() => confirmDelete ? onDelete(date) : setConfirmDelete(true)}>
                        {confirmDelete ? 'Точно удалить?' : 'Удалить'}
                    </button>
                )}
            </div>
        </>
    );
}

/* ---------- Свои праздники: день рождения, годовщина ---------- */
// Отдельно от желания: праздник можно поставить и в день без желания. Повторяется каждый год.
// В одном дне их может быть несколько. У каждого — меню ⋮: добавить ещё, редактировать, удалить
function MyHolidays({ date, holidays, onAdd, onRename, onDelete }: {
    date: string;
    holidays: HolidayDto[];
    onAdd: (date: string, title: string) => void;
    onRename: (holiday: HolidayDto, title: string) => void;
    onDelete: (holiday: HolidayDto) => void;
}) {
    // Что сейчас открыто: ничего, форма «добавить ещё» или редактирование праздника с этим id
    const [editing, setEditing] = useState<'none' | 'new' | number>('none');
    const close = () => setEditing('none');

    // Праздников ещё нет: свёрнутый блок, раскрывается по нажатию на заголовок
    if (holidays.length === 0) {
        return (
            <details className="hol-field">
                <summary>
                    <span className="grow">🎂 Свой праздник</span>
                    <span className="chev" aria-hidden="true">›</span>
                </summary>
                <HolidayForm button="Добавить праздник" onSubmit={title => onAdd(date, title)} />
            </details>
        );
    }

    // Праздники есть: показываем их списком
    return (
        <div className="hol-field hol-list">
            {holidays.map(h => editing === h.id ? (
                <HolidayForm key={h.id} initial={h.title} button="Переименовать" onCancel={close}
                             onSubmit={title => { onRename(h, title); close(); }} />
            ) : (
                <div className="hol-row" key={h.id}>
                    <span className="grow">🎂 {h.title}</span>
                    <KebabMenu label={`Действия: ${h.title}`} items={[
                        { label: 'Добавить ещё', onClick: () => setEditing('new') },
                        { label: 'Редактировать', onClick: () => setEditing(h.id) },
                        { label: 'Удалить', onClick: () => onDelete(h), danger: true },
                    ]} />
                </div>
            ))}
            {editing === 'new' && (
                <HolidayForm button="Добавить" onCancel={close} onSubmit={title => { onAdd(date, title); close(); }} />
            )}
        </div>
    );
}

// Поле с названием праздника и кнопками. <form> — чтобы срабатывал и Enter
function HolidayForm({ initial = '', button, onSubmit, onCancel }:
                         { initial?: string; button: string; onSubmit: (title: string) => void; onCancel?: () => void }) {
    const [title, setTitle] = useState(initial);
    const ready = title.trim() !== '' && title.trim() !== initial;

    return (
        <form className="hol-form" onSubmit={e => { e.preventDefault(); if (ready) onSubmit(title.trim()); }}>
            <label className="lbl">Название <span className="hint">(каждый год в этот день)</span>
                <input className="field" maxLength={40} placeholder="Например, день рождения мамы"
                       autoFocus={!!onCancel} value={title} onChange={e => setTitle(e.target.value)} />
            </label>
            <div className="acts">
                <button className="btn sm blue" disabled={!ready}>{button}</button>
                {onCancel && <button type="button" className="btn sm ghost" onClick={onCancel}>Отмена</button>}
            </div>
        </form>
    );
}

/* ---------- Чужой открытый день: только чтение ---------- */
function ReadOnlyDay({ wish }: { wish: Wish }) {
    return (
        <>
            <div className="preview"><WishThumb img={wish.img} /></div>
            <p className="ro-title">{wish.title}</p>
            {wish.comment ? <p className="ro-text">{wish.comment}</p> : <p className="hint">Комментария нет.</p>}
        </>
    );
}

/* ---------- Чужой закрытый день ---------- */
function LockedDay({ owner, asked, onAsk }: { owner: UserId; asked: boolean; onAsk: () => void }) {
    return (
        <div className="lockmsg">
            <p>🔒 Владелец пока не открыл вам этот день</p>
            <button className="btn" onClick={onAsk} disabled={asked}>
                {asked ? 'Запрос отправлен' : 'Попросить доступ'}
            </button>
            {asked && <span className="hint">{USERS[owner].name} увидит запрос в разделе «Друзья».</span>}
        </div>
    );
}