// A small offline-resilience layer for the one action that must never be
// blocked by venue wifi: recording a match result. Submissions that fail
// with a NetworkError (no response at all, not a server error) are
// persisted to localStorage and retried with backoff until they land or
// the server tells us they're stale — at which point they're dropped and
// the caller re-syncs from the server's authoritative state.
import { api } from '../apiClient/client.js';
import { NetworkError } from '../apiClient/client.js';
import type { TournamentState } from '../apiClient/types.js';

export type QueuedMatchSubmission = {
  id: string;
  tournamentId: string;
  expectedMatchNumber: number;
  kingParticipantId: string;
  challengerParticipantId: string;
  winnerParticipantId: string;
  queuedAt: number;
};

const STORAGE_KEY = 'sts:pendingMatchSubmissions';

function safeReadQueue(): QueuedMatchSubmission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteQueue(queue: QueuedMatchSubmission[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage unavailable (private window, quota) — the queue is
    // then memory-only for this tab, which is still better than nothing.
  }
}

type Listener = (queue: QueuedMatchSubmission[]) => void;
const listeners = new Set<Listener>();
let queue: QueuedMatchSubmission[] = safeReadQueue();
let flushing = false;
let backoffMs = 1000;

function notify() {
  for (const l of listeners) l(queue);
}

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue);
  return () => listeners.delete(listener);
}

export function getQueueForTournament(tournamentId: string): QueuedMatchSubmission[] {
  return queue.filter((q) => q.tournamentId === tournamentId);
}

export function enqueueMatchSubmission(submission: Omit<QueuedMatchSubmission, 'id' | 'queuedAt'>) {
  queue = [...queue, { ...submission, id: crypto.randomUUID(), queuedAt: Date.now() }];
  safeWriteQueue(queue);
  notify();
  scheduleFlush();
}

function dequeue(id: string) {
  queue = queue.filter((q) => q.id !== id);
  safeWriteQueue(queue);
  notify();
}

/** Called after every successful/settled request against a tournament so a
 * queued submission that turns out to already be reflected server-side
 * (it landed, but the response to the original request never came back)
 * gets cleared instead of retried into a guaranteed 409. */
export function reconcileQueueWithState(state: TournamentState) {
  const stale = queue.filter(
    (q) => q.tournamentId === state.id && q.expectedMatchNumber < state.nextMatchNumber,
  );
  if (stale.length === 0) return;
  queue = queue.filter((q) => !stale.includes(q));
  safeWriteQueue(queue);
  notify();
}

let onFlushedTournament: ((state: TournamentState) => void) | null = null;
export function setOfflineFlushHandler(handler: (state: TournamentState) => void) {
  onFlushedTournament = handler;
}

export function scheduleFlush(delayMs = 0) {
  if (flushing) return;
  setTimeout(flushQueue, delayMs);
}

async function flushQueue() {
  if (flushing || queue.length === 0) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    // Oldest first, and strictly per-tournament order matters because
    // expectedMatchNumber must match the server's next slot.
    const next = [...queue].sort((a, b) => a.queuedAt - b.queuedAt)[0];
    if (!next) return;

    try {
      const state = await api.tournaments.submitMatch(next.tournamentId, {
        expectedMatchNumber: next.expectedMatchNumber,
        kingParticipantId: next.kingParticipantId,
        challengerParticipantId: next.challengerParticipantId,
        winnerParticipantId: next.winnerParticipantId,
      });
      dequeue(next.id);
      backoffMs = 1000;
      onFlushedTournament?.(state);
      if (queue.length > 0) scheduleFlush();
    } catch (err) {
      if (err instanceof NetworkError) {
        backoffMs = Math.min(backoffMs * 2, 30_000);
        scheduleFlush(backoffMs);
        return;
      }
      // A real server response (likely 409 STALE_MATCH_NUMBER because this
      // exact match was already recorded some other way) — this
      // submission can never succeed as-is. Drop it; the state carried on
      // the error (if any) re-syncs the UI.
      dequeue(next.id);
      const state = (err as { state?: TournamentState }).state;
      if (state) onFlushedTournament?.(state);
      if (queue.length > 0) scheduleFlush();
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    backoffMs = 1000;
    scheduleFlush();
  });
}
