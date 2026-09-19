import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient/client.js';

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await api.auth.me();
      } catch {
        return { authed: false };
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  const login = useMutation({
    mutationFn: (passcode: string) => api.auth.login(passcode),
    onSuccess: () => queryClient.setQueryData(['auth', 'me'], { authed: true }),
  });

  const logout = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], { authed: false });
      queryClient.clear();
    },
  });

  return {
    isAuthed: meQuery.data?.authed ?? false,
    isLoading: meQuery.isLoading,
    login,
    logout,
  };
}
