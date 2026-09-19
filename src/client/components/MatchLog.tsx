import type { MatchLogEntry } from '@shared/types.js';
import styles from './MatchLog.module.css';

export function MatchLog({ log }: { log: MatchLogEntry[] }) {
  if (log.length === 0) return null;
  return (
    <div className={styles.wrap}>
      <h2 className={styles.heading}>Battle by battle</h2>
      <div className={styles.list}>
        {[...log].reverse().map((entry) => (
          <div key={entry.matchNumber} className={styles.entry}>
            <span className={styles.num}>#{entry.matchNumber}</span>
            <span>
              {entry.kingName} vs {entry.challengerName}, <span className={styles.winner}>{entry.winnerName}</span>{' '}
              wins ({entry.winnerScoreAfter})
            </span>
            {entry.throneChanged ? <span className={styles.throne}>Throne changed</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
