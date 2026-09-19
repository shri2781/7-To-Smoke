import { useState } from 'react';
import { useTournamentHistory } from '../hooks/useHistory.js';
import { useDeleteTournament } from '../hooks/useTournament.js';
import { PageHeader } from '../components/PageHeader.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import styles from './Rules.module.css';

export function Rules() {
  const { data } = useTournamentHistory();
  const deleteTournament = useDeleteTournament();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      <PageHeader eyebrow="Reference" title="Rules" />
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>How a battle works</h2>
          <p>
            One dancer starts as king, one as the first challenger; everyone else waits in a queue. After every bout
            the loser goes to the back of the queue — the winner stays (or becomes) king and earns one point. The
            next challenger is always whoever is at the front of the waiting line.
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>How it ends</h2>
          <ol>
            <li>
              <strong>First to the target score wins outright</strong> (default: first to 7) — the app declares this
              automatically the instant it happens.
            </li>
            <li>
              <strong>If the match cap is reached first</strong> (default: 27 bouts) and nobody has hit the target,
              the app stops and shows the standings. It does <em>not</em> guess a tiebreak — an admin taps a name in
              the standings to crown the champion.
            </li>
            <li>
              An admin can also end a tournament early at any time the same way — tap "Crown a champion" on the
              Scoreboard screen.
            </li>
          </ol>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>How the standings are ordered</h2>
          <p>This ranking is for display only — it never decides the champion by itself. Ties break in this order:</p>
          <ol>
            <li>Total wins</li>
            <li>Head-to-head record against opponents tied on wins</li>
            <li>Currently holding the throne</li>
            <li>Fewer bouts played (same wins in fewer bouts ranks higher)</li>
            <li>Most recent bout won</li>
            <li>Seed order (the position they were entered in)</li>
          </ol>
          <p>Any standings row broken by rule 2 or later shows a small "Tiebreak" footnote explaining why.</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Undo, abandon, and history</h2>
          <ul>
            <li>Undo removes only the most recent bout — including the one that just ended the tournament.</li>
            <li>Abandoning a tournament keeps it in Past Games but excludes it from the All Time leaderboard.</li>
            <li>Renaming or retiring a dancer never changes how their name appears in a past recap.</li>
          </ul>
        </div>

        <div className={`${styles.card} ${styles.dangerCard}`}>
          <h2 className={styles.cardTitle}>Danger zone</h2>
          <p>Permanently delete a tournament and its full match log. This cannot be undone — use it only for test runs.</p>
          {(data?.items ?? []).map((t) => (
            <div key={t.id} className={styles.dangerRow}>
              <span>
                {t.name} ({new Date(t.heldOn).toLocaleDateString()})
              </span>
              <button
                type="button"
                onClick={() => setToDelete({ id: t.id, name: t.name })}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--red)',
                  color: 'var(--red)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {toDelete ? (
        <ConfirmDialog
          title={`Permanently delete "${toDelete.name}"?`}
          body="This removes the tournament and its entire match log forever. This cannot be undone."
          confirmLabel="Delete forever"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            deleteTournament.mutate(toDelete.id);
            setToDelete(null);
          }}
        />
      ) : null}
    </>
  );
}
