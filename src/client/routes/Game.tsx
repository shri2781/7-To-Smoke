import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useActiveTournament, useTournament, useUndoLastMatch, useDeclareWinner, useAbandonTournament, useResumeTournament, useRecordMatch } from '../hooks/useTournament.js';
import { PosterHeader } from '../components/PosterHeader.js';
import { BattleCard } from '../components/BattleCard.js';
import { ResultStamp } from '../components/ResultStamp.js';
import { Scoreboard } from '../components/Scoreboard.js';
import { MatchLog } from '../components/MatchLog.js';
import { OfflineBanner } from '../components/OfflineBanner.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { Button } from '../components/Button.js';
import type { TournamentState } from '../apiClient/types.js';
import styles from './Game.module.css';

type PendingAction =
  | { type: 'undo' }
  | { type: 'abandon' }
  | { type: 'declare'; participantId: string; name: string };

function exportTournamentJson(state: TournamentState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function endReasonCopy(state: TournamentState): string {
  switch (state.endReason) {
    case 'target_reached':
      return `Reached ${state.targetScore} wins first.`;
    case 'cap_reached_manual':
      return `Crowned by the admin after the ${state.maxMatches}-bout cap.`;
    case 'forced':
      return 'Tournament ended early by the admin.';
    default:
      return '';
  }
}

export function Game() {
  const { id } = useParams<{ id?: string }>();
  const activeQuery = useActiveTournament();
  const byIdQuery = useTournament(id);
  const query = id ? byIdQuery : activeQuery;
  const state = query.data;

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [declaring, setDeclaring] = useState(false);

  const recordMatch = useRecordMatch(state?.id ?? '');
  const undoLastMatch = useUndoLastMatch(state?.id ?? '');
  const declareWinner = useDeclareWinner(state?.id ?? '');
  const abandon = useAbandonTournament(state?.id ?? '');
  const resume = useResumeTournament(state?.id ?? '');

  if (query.isLoading) {
    return <p className={styles.empty}>Loading…</p>;
  }

  if (!state) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.emptyTitle}>No battle in progress</h1>
        <p className={styles.emptyBody}>Start a new tournament to get the scoreboard going.</p>
        <Link to="/new">
          <Button type="button">Start a new game</Button>
        </Link>
      </div>
    );
  }

  const winner = state.winnerParticipantId ? state.byId[state.winnerParticipantId] : undefined;

  return (
    <>
      <OfflineBanner tournamentId={state.id} />
      <PosterHeader
        subtitle={state.name}
        targetScore={state.targetScore}
        maxMatches={state.maxMatches}
        participantCount={state.standings.length}
      />
      <div className={styles.layout}>
        <div className={styles.matchPanel}>
          <h2 className={styles.heading}>
            {state.status === 'completed' ? 'Result' : state.status === 'abandoned' ? 'Abandoned' : 'Next Match'}
          </h2>

          {state.status === 'abandoned' ? <span className={styles.abandonedTag}>Abandoned</span> : null}

          {state.status === 'completed' && winner ? (
            <ResultStamp headline={`${winner.name} Wins`} subline={endReasonCopy(state)} />
          ) : null}

          {state.phase === 'awaiting_manual_winner' && state.status === 'in_progress' ? (
            <div className={styles.capNotice}>
              {state.maxMatches} bouts of regulation are complete and nobody reached {state.targetScore}. Tap "Crown a
              champion" below and pick a name from the standings, the app won't guess a tiebreak for you.
            </div>
          ) : null}

          {state.currentMatch && state.status === 'in_progress' ? (
            <BattleCard
              kingName={state.byId[state.currentMatch.kingId]?.name ?? '—'}
              challengerName={state.byId[state.currentMatch.challengerId]?.name ?? '—'}
              kingStreak={state.currentMatch.kingStreak}
              disabled={recordMatch.isPending}
              onDeclare={(winnerSide) => {
                const m = state.currentMatch!;
                recordMatch.mutate({
                  matchNumber: m.matchNumber,
                  kingId: m.kingId,
                  challengerId: m.challengerId,
                  winnerId: winnerSide === 'king' ? m.kingId : m.challengerId,
                });
              }}
            />
          ) : null}

          <div className={styles.actions} data-app-actions>
            {state.status === 'in_progress' ? (
              <Button
                type="button"
                variant={declaring ? 'primary' : 'secondary'}
                onClick={() => setDeclaring((v) => !v)}
              >
                {declaring ? 'Cancel crowning' : 'Crown a champion'}
              </Button>
            ) : null}
            {state.matchesPlayed > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setPending({ type: 'undo' })}>
                Undo last bout
              </Button>
            ) : null}
            {state.status === 'in_progress' ? (
              <Button type="button" variant="danger" onClick={() => setPending({ type: 'abandon' })}>
                Abandon
              </Button>
            ) : null}
            {state.status === 'abandoned' ? (
              <Button type="button" onClick={() => resume.mutate()}>
                Resume
              </Button>
            ) : null}
            {state.status !== 'in_progress' ? (
              <Link to="/new">
                <Button type="button">Start a new game</Button>
              </Link>
            ) : null}
            {state.status !== 'in_progress' ? (
              <>
                <Button type="button" variant="secondary" onClick={() => window.print()}>
                  Print recap
                </Button>
                <Button type="button" variant="secondary" onClick={() => exportTournamentJson(state)}>
                  Export JSON
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <Scoreboard
          standings={state.standings}
          onDeclareWinner={
            declaring ? (participantId) => {
              const s = state.byId[participantId];
              setPending({ type: 'declare', participantId, name: s?.name ?? 'this dancer' });
            } : undefined
          }
        />
      </div>

      {state.status !== 'in_progress' ? (
        <div className={styles.layout} style={{ gridTemplateColumns: '1fr' }}>
          <MatchLog log={state.log} />
        </div>
      ) : null}

      {pending?.type === 'undo' ? (
        <ConfirmDialog
          title="Undo last bout?"
          body={
            state.status === 'completed'
              ? 'This was the deciding bout, undoing it will re-open the tournament and clear the result.'
              : 'This removes the most recently recorded result. This cannot be redone.'
          }
          confirmLabel="Undo"
          danger
          onCancel={() => setPending(null)}
          onConfirm={() => {
            undoLastMatch.mutate(state.matchesPlayed);
            setPending(null);
          }}
        />
      ) : null}

      {pending?.type === 'abandon' ? (
        <ConfirmDialog
          title="Abandon this tournament?"
          body="It stays visible in Past Games and can be resumed later."
          confirmLabel="Abandon"
          danger
          onCancel={() => setPending(null)}
          onConfirm={() => {
            abandon.mutate();
            setPending(null);
          }}
        />
      ) : null}

      {pending?.type === 'declare' ? (
        <ConfirmDialog
          title={`Crown ${pending.name} the champion?`}
          body="This ends the tournament immediately and records the result. This can be undone right after, but not later."
          confirmLabel="Crown champion"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            declareWinner.mutate(pending.participantId);
            setPending(null);
            setDeclaring(false);
          }}
        />
      ) : null}
    </>
  );
}
