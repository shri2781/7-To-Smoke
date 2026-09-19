import styles from './PageHeader.module.css';

export function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className={styles.header}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.title}>{title}</h1>
    </div>
  );
}
