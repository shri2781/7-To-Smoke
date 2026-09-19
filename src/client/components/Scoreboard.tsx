import type { Standing } from '@shared/types.js';
import styles from './Scoreboard.module.css';

export function Scoreboard({
  standings,
  heading = 'Scoreboard',
  onDeclareWinner,
}: {
  standings: Standing[];
  heading?: string;
  /** When provided, each row becomes clickable — used for the "tap the
   * champion" flow at the match cap and for force-ending a tournament. */
  onDeclareWinner?: (participantId: string) => void;
}) {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>{heading}</h1>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Dancer</th>
              <th>W</th>
              <th>L</th>
              <th>Streak</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr
                key={s.participantId}
                className={`${styles.row} ${s.isKing ? styles.rowKing : ''} ${s.isChallenger ? styles.rowChallenger : ''}`}
                onClick={onDeclareWinner ? () => onDeclareWinner(s.participantId) : undefined}
                style={onDeclareWinner ? { cursor: 'pointer' } : undefined}
              >
                <td className={styles.rank}>{s.rank}</td>
                <td>
                  <span className={styles.name}>
                    {s.name}
                    {s.isKing ? <span className={`${styles.badge} ${styles.badgeKing}`}>King</span> : null}
                    {s.isChallenger ? (
                      <span className={`${styles.badge} ${styles.badgeChallenger}`}>Challenger</span>
                    ) : null}
                  </span>
                  {s.crew ? <span className={styles.crew}>{s.crew}</span> : null}
                  {s.tiebreakReason ? <span className={styles.tiebreak}>Tiebreak: {s.tiebreakReason}</span> : null}
                </td>
                <td className={styles.wins}>{s.wins}</td>
                <td>{s.losses}</td>
                <td>{s.currentStreak > 0 ? `${s.currentStreak}🔥` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
