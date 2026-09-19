import styles from './PosterHeader.module.css';

export function PosterHeader({
  subtitle,
  targetScore,
  maxMatches,
  participantCount,
}: {
  subtitle: string;
  targetScore?: number;
  maxMatches?: number;
  participantCount?: number;
}) {
  return (
    <header className={styles.title}>
      <div className={styles.frame}>
        <p className={styles.presents}>Festember Presents</p>
        <h1>
          7 <span>to</span> Smoke
        </h1>
        <p className={styles.subtitle}>{subtitle}</p>
        {targetScore && maxMatches && participantCount ? (
          <div className={styles.metaStrip}>
            <span>{participantCount} Dancers</span>
            <span className={styles.dot}>&bull;</span>
            <span>First to {targetScore}</span>
            <span className={styles.dot}>&bull;</span>
            <span>{maxMatches} Max Battles</span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
