import { useQuery } from '@tanstack/react-query';
import { api } from '../apiClient/client.js';

export function useTournamentHistory(status?: string) {
  return useQuery({
    queryKey: ['tournaments', 'history', status ?? 'all'],
    queryFn: () => api.tournaments.list({ status, limit: 30 }),
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.stats.leaderboard(),
  });
}
