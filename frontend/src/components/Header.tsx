import type { UserId } from '../types';
import { USERS } from '../data/fakeData';

type Props = {
    me: UserId;
    badge: number;
    onChangeMe: (id: UserId) => void;
    onFriendsClick: () => void;
};

export function Header({ me, badge, onChangeMe, onFriendsClick }: Props) {
    return (
        <header className="top">
            <div className="top-in">
                <div className="logo"><i>🎁</i><span>Адвент-календарь</span></div>

                {/* Временный переключатель для демо. На этапе 6 его заменит настоящий вход. */}
                <label className="viewas" htmlFor="viewas">Смотреть как:
                    <select id="viewas" value={me} onChange={e => onChangeMe(e.target.value)}>
                        {Object.values(USERS).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </label>

                <button className="btn-friends" onClick={onFriendsClick}>
                    Друзья{badge > 0 && <span className="badge">{badge}</span>}
                </button>
            </div>
        </header>
    );
}