import { NavLink } from 'react-router-dom';
import { useActiveTournament } from '../hooks/useTournament.js';
import { useAuth } from '../hooks/useAuth.js';
import styles from './Sidebar.module.css';

const TABS = [
  { to: '/new', label: 'New Game' },
  { to: '/game', label: 'Scoreboard' },
  { to: '/history', label: 'Past Games' },
  { to: '/leaderboard', label: 'All Time' },
  { to: '/dancers', label: 'Dancers' },
  { to: '/rules', label: 'Rules' },
];

export function Sidebar() {
  const { data: active } = useActiveTournament();
  const { logout } = useAuth();

  return (
    <nav className={styles.sidebar} aria-label="Main" data-app-sidebar>
      <div className={styles.brand}>
        7 <span>to</span> Smoke
      </div>
      <div className={styles.nav}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}
          >
            {tab.label}
            {tab.to === '/game' && active ? <span className={styles.activeDot} title="Game in progress" /> : null}
          </NavLink>
        ))}
      </div>
      <button className={styles.logout} onClick={() => logout.mutate()}>
        Log out
      </button>
    </nav>
  );
}
