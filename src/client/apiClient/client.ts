import type { Dancer, TournamentState, TournamentSummary } from './types.js';

export class ApiClientError extends Error {
  status: number;
  code: string;
  state?: TournamentState;
  details?: unknown;

  constructor(status: number, code: string, message: string, opts?: { state?: TournamentState; details?: unknown }) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.state = opts?.state;
    this.details = opts?.details;
  }
}

/** Thrown when `fetch` itself fails (no response at all) — the venue-wifi
 * case, distinct from a server error response. Callers use this to decide
 * whether to queue a mutation for retry instead of surfacing an error. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new NetworkError(err);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const code = payload?.error?.code ?? 'UNKNOWN';
    const message = payload?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiClientError(res.status, code, message, { state: payload?.state, details: payload?.error?.details });
  }

  return payload as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  auth: {
    login: (passcode: string) => request<void>('/auth/login', { method: 'POST', body: json({ passcode }) }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    me: () => request<{ authed: boolean }>('/auth/me'),
  },
  dancers: {
    list: () => request<Dancer[]>('/dancers'),
    create: (data: { name: string; crew?: string | null }) =>
      request<Dancer>('/dancers', { method: 'POST', body: json(data) }),
    update: (id: string, data: { name?: string; crew?: string | null }) =>
      request<Dancer>(`/dancers/${id}`, { method: 'PATCH', body: json(data) }),
  },
  tournaments: {
    active: () => request<TournamentState | undefined>('/tournaments/active'),
    get: (id: string) => request<TournamentState>(`/tournaments/${id}`),
    list: (params?: { status?: string; cursor?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.cursor) qs.set('cursor', params.cursor);
      if (params?.limit) qs.set('limit', String(params.limit));
      const suffix = qs.toString() ? `?${qs}` : '';
      return request<{ items: TournamentSummary[]; nextCursor: string | null }>(`/tournaments${suffix}`);
    },
    create: (data: {
      name: string;
      heldOn?: string;
      targetScore: number;
      maxMatches: number;
      participants: { dancerId: string }[];
    }) => request<TournamentState>('/tournaments', { method: 'POST', body: json(data) }),
    submitMatch: (
      tournamentId: string,
      data: {
        expectedMatchNumber: number;
        kingParticipantId: string;
        challengerParticipantId: string;
        winnerParticipantId: string;
      },
    ) => request<TournamentState>(`/tournaments/${tournamentId}/matches`, { method: 'POST', body: json(data) }),
    undoLastMatch: (tournamentId: string, expectedMatchNumber: number) =>
      request<TournamentState>(`/tournaments/${tournamentId}/matches/last`, {
        method: 'DELETE',
        body: json({ expectedMatchNumber }),
      }),
    declareWinner: (tournamentId: string, participantId: string) =>
      request<TournamentState>(`/tournaments/${tournamentId}/declare-winner`, {
        method: 'POST',
        body: json({ participantId }),
      }),
    abandon: (tournamentId: string) =>
      request<TournamentState>(`/tournaments/${tournamentId}/abandon`, { method: 'POST' }),
    resume: (tournamentId: string) =>
      request<TournamentState>(`/tournaments/${tournamentId}/resume`, { method: 'POST' }),
    remove: (tournamentId: string) => request<void>(`/tournaments/${tournamentId}`, { method: 'DELETE' }),
  },
};
