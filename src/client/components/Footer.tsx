import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.credits}>
      Made with <span className={styles.heart}>&#10084;</span> by Shriram
    </footer>
  );
}
