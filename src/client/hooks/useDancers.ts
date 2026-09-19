import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient/client.js';

export function useCreateDancer() {
  return useMutation({
    mutationFn: api.dancers.create,
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
