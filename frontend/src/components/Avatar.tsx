import type { User } from '../types';

type Props = { user: User; large?: boolean };

// Кружок с первой буквой имени
export function Avatar({ user, large = false }: Props) {
    return (
        <span className={large ? 'ava lg' : 'ava'} style={{ background: user.color }} aria-hidden="true">
      {user.name[0]}
    </span>
    );
}