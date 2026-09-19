import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient/client.js';

export function useDancers() {
  return useQuery({
    queryKey: ['dancers'],
    queryFn: () => api.dancers.list(),
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
