import styles from './ResultStamp.module.css';

export function ResultStamp({ headline, subline }: { headline: string; subline?: string }) {
  return (
    <h1 className={styles.result}>
      {headline}
      {subline ? <span className={styles.subline}>{subline}</span> : null}
    </h1>
  );
}
