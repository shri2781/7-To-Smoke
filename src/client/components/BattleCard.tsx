import styles from './BattleCard.module.css';

export function BattleCard({
  kingName,
  challengerName,
  kingStreak,
  disabled,
  onDeclare,
}: {
  kingName: string;
  challengerName: string;
  kingStreak: number;
  disabled?: boolean;
  onDeclare: (winner: 'king' | 'challenger') => void;
}) {
  return (
    <>
      <div className={styles.card}>
        <button
          type="button"
          className={`${styles.corner} ${styles.kingSide}`}
          disabled={disabled}
          onClick={() => onDeclare('king')}
        >
          <span>
            <span className={styles.name}>{kingName}</span>
            {kingStreak > 1 ? <span className={styles.streak}>On a {kingStreak}-win streak</span> : null}
          </span>
        </button>
        <div className={styles.vs}>VS</div>
        <button
          type="button"
          className={`${styles.corner} ${styles.challengerSide}`}
          disabled={disabled}
          onClick={() => onDeclare('challenger')}
        >
          <span className={styles.name}>{challengerName}</span>
        </button>
      </div>
      <p className={styles.tapHint}>Tap a corner to declare the winner</p>
    </>
  );
}
