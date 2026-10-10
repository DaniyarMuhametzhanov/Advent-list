import type { UserId } from '../types';
import { USERS } from '../data/fakeData';
import { Avatar } from './Avatar';

type Props = {
    me: UserId;
    badge: number;
    onFriendsClick: () => void;
    onLogout: () => void;
};

export function Header({ me, badge, onFriendsClick, onLogout }: Props) {
    return (
        <header className="top">
            <div className="top-in">
                <div className="logo"><i>🎁</i><span>Адвент-календарь</span></div>

                <span className="me"><Avatar user={USERS[me]} />{USERS[me].name}</span>
                <button className="btn sm ghost" onClick={onLogout}>Выйти</button>

                <button className="btn-friends" onClick={onFriendsClick}>
                    Друзья{badge > 0 && <span className="badge">{badge}</span>}
                </button>
            </div>
        </header>
    );
}