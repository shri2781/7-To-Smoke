import { useLeaderboard } from '../hooks/useHistory.js';
import { PageHeader } from '../components/PageHeader.js';
import styles from './Leaderboard.module.css';

export function Leaderboard() {
  const { data, isLoading } = useLeaderboard();

  return (
    <>
      <PageHeader eyebrow="Hall of Fame" title="All Time" />
      <div className={styles.wrap}>
        {isLoading ? <p>Loading…</p> : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Dancer</th>
                <th>Crew</th>
                <th>Titles</th>
                <th>Tournaments</th>
                <th>W</th>
                <th>L</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.dancerId} className={row.retired ? styles.retired : ''}>
                  <td>{row.name}</td>
                  <td>{row.crew ?? '—'}</td>
                  <td className={styles.titles}>{row.titles}</td>
                  <td>{row.tournamentsPlayed}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{(row.winRate * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--text-dim)', marginTop: 16, fontSize: '0.85rem' }}>
          Only completed tournaments count — abandoned ones are excluded since a run cut short skews the record.
        </p>
      </div>
    </>
  );
}
