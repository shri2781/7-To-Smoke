import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournamentHistory } from '../hooks/useHistory.js';
import { PageHeader } from '../components/PageHeader.js';
import styles from './History.module.css';

const FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
] as const;

export function History() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { data, isLoading } = useTournamentHistory(status);

  return (
    <>
      <PageHeader eyebrow="Archive" title="Past Games" />
      <div className={styles.wrap}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              className={`${styles.filterBtn} ${status === f.value ? styles.filterBtnActive : ''}`}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? <p>Loading…</p> : null}

        <div className={styles.list}>
          {(data?.items ?? []).map((t) => (
            <Link key={t.id} to={`/game/${t.id}`} className={`${styles.row} ${t.status === 'abandoned' ? styles.rowAbandoned : ''}`}>
              <span className={styles.name}>{t.name}</span>
              <span className={styles.date}>{new Date(t.heldOn).toLocaleDateString()}</span>
              <span>
                {t.matchesPlayed}/{t.maxMatches} battles
              </span>
              {t.winnerName ? <span className={styles.winnerTag}>{t.winnerName}</span> : null}
              <span className={styles.statusTag}>{t.status.replace('_', ' ')}</span>
            </Link>
          ))}
          {data && data.items.length === 0 ? <p>No tournaments here yet.</p> : null}
        </div>
      </div>
    </>
  );
}
