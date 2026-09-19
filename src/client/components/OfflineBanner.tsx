import { usePendingSubmissions } from '../hooks/useTournament.js';
import styles from './OfflineBanner.module.css';

export function OfflineBanner({ tournamentId }: { tournamentId: string | undefined }) {
  const pending = usePendingSubmissions(tournamentId);
  if (pending.length === 0) return null;

  return (
    <div className={styles.banner} role="status">
      Offline — {pending.length} unsaved {pending.length === 1 ? 'result' : 'results'}. Will sync automatically.
    </div>
  );
}
