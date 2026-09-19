import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError, NetworkError } from '../api/client.js';
import type { TournamentState } from '../api/types.js';
import { optimisticallyApplyMatch } from '../lib/reconstructEngine.js';
import {
  enqueueMatchSubmission,
  getQueueForTournament,
  reconcileQueueWithState,
  setOfflineFlushHandler,
  subscribeToQueue,
} from '../offline/offlineQueue.js';

export function tournamentQueryKey(id: string) {
  return ['tournament', id] as const;
}

export function useActiveTournament() {
  return useQuery({
    queryKey: ['tournament', 'active'],
    queryFn: () => api.tournaments.active(),
    refetchOnWindowFocus: true,
  });
}

export function useTournament(id: string | undefined) {
  return useQuery({
    queryKey: tournamentQueryKey(id ?? ''),
    queryFn: () => api.tournaments.get(id!),
    enabled: !!id,
    refetchOnWindowFocus: true,
  });
}

function setTournamentEverywhere(queryClient: ReturnType<typeof useQueryClient>, state: TournamentState) {
  queryClient.setQueryData(tournamentQueryKey(state.id), state);
  if (state.status === 'in_progress') {
    queryClient.setQueryData(['tournament', 'active'], state);
  } else {
    queryClient.setQueryData(['tournament', 'active'], undefined);
  }
  queryClient.invalidateQueries({ queryKey: ['tournaments'] });
  queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
}

/** Wires the offline queue's background flush results back into the
 * query cache. Mount once near the app root. */
export function useOfflineFlushSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    setOfflineFlushHandler((state) => setTournamentEverywhere(queryClient, state));
    return () => setOfflineFlushHandler(() => {});
  }, [queryClient]);
}

export function usePendingSubmissions(tournamentId: string | undefined) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeToQueue(() => setTick((n) => n + 1)), []);
  return tournamentId ? getQueueForTournament(tournamentId) : [];
}

export function useRecordMatch(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { matchNumber: number; kingId: string; challengerId: string; winnerId: string }) => {
      try {
        return await api.tournaments.submitMatch(tournamentId, {
          expectedMatchNumber: vars.matchNumber,
          kingParticipantId: vars.kingId,
          challengerParticipantId: vars.challengerId,
          winnerParticipantId: vars.winnerId,
        });
      } catch (err) {
        if (err instanceof NetworkError) {
          // Venue wifi dropped mid-tap. Queue it — the optimistic state
          // already applied by onMutate stays on screen, and the queue
          // flushes automatically once the connection returns.
          enqueueMatchSubmission({
            tournamentId,
            expectedMatchNumber: vars.matchNumber,
            kingParticipantId: vars.kingId,
            challengerParticipantId: vars.challengerId,
            winnerParticipantId: vars.winnerId,
          });
          const current = queryClient.getQueryData<TournamentState>(tournamentQueryKey(tournamentId));
          if (!current) throw err;
          return current; // already-optimistic state stands until it flushes
        }
        throw err;
      }
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: tournamentQueryKey(tournamentId) });
      const previous = queryClient.getQueryData<TournamentState>(tournamentQueryKey(tournamentId));
      if (previous) {
        const optimistic = optimisticallyApplyMatch(previous, {
          matchNumber: vars.matchNumber,
          kingId: vars.kingId,
          challengerId: vars.challengerId,
          winnerId: vars.winnerId,
        });
        setTournamentEverywhere(queryClient, optimistic);
      }
      return { previous };
    },
    onSuccess: (state) => {
      setTournamentEverywhere(queryClient, state);
      reconcileQueueWithState(state);
    },
    onError: (err, _vars, context) => {
      // A real server rejection (409 stale/invalid pairing, tournament
      // completed) — self-heal from the state it carried rather than
      // just rolling back blindly, since the true current state may have
      // moved further than our local snapshot.
      if (err instanceof ApiClientError && err.state) {
        setTournamentEverywhere(queryClient, err.state);
        return;
      }
      if (context?.previous) {
        setTournamentEverywhere(queryClient, context.previous);
      }
    },
  });
}

export function useUndoLastMatch(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedMatchNumber: number) => api.tournaments.undoLastMatch(tournamentId, expectedMatchNumber),
    onSuccess: (state) => setTournamentEverywhere(queryClient, state),
    onError: (err) => {
      if (err instanceof ApiClientError && err.state) setTournamentEverywhere(queryClient, err.state);
    },
  });
}

export function useDeclareWinner(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (participantId: string) => api.tournaments.declareWinner(tournamentId, participantId),
    onSuccess: (state) => setTournamentEverywhere(queryClient, state),
  });
}

export function useAbandonTournament(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.tournaments.abandon(tournamentId),
    onSuccess: (state) => setTournamentEverywhere(queryClient, state),
  });
}

export function useResumeTournament(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.tournaments.resume(tournamentId),
    onSuccess: (state) => setTournamentEverywhere(queryClient, state),
  });
}

export function useDeleteTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) => api.tournaments.remove(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', 'active'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}

export function useCreateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.tournaments.create,
    onSuccess: (state) => setTournamentEverywhere(queryClient, state),
  });
}
