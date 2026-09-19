import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function useDancers(includeRetired = false) {
  return useQuery({
    queryKey: ['dancers', includeRetired],
    queryFn: () => api.dancers.list(includeRetired),
  });
}

export function useCreateDancer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.dancers.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dancers'] }),
  });
}

export function useUpdateDancer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; crew?: string | null } }) =>
      api.dancers.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dancers'] }),
  });
}

export function useDeleteDancer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.dancers.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dancers'] }),
  });
}
