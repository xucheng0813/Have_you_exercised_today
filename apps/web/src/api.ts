import type { Checkin, NewCheckin, SetupStatus, Stats, User, WeeklyReport } from '@fitness/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  users: () => request<User[]>('/api/users'),
  createUser: (name: string) => request<User>('/api/users', post({ name })),
  stats: (userId: number) => request<Stats>(`/api/stats?userId=${userId}`),
  checkins: (userId: number, from: string, to: string) =>
    request<Checkin[]>(`/api/checkins?userId=${userId}&from=${from}&to=${to}`),
  createCheckin: (body: NewCheckin & { userId: number }) => request<Checkin>('/api/checkins', post(body)),
  deleteCheckin: (id: number, userId: number) =>
    request<{ ok: boolean }>(`/api/checkins/${id}?userId=${userId}`, { method: 'DELETE' }),
  latestReport: (userId: number) => request<WeeklyReport | null>(`/api/reports/latest?userId=${userId}`),
  setup: () => request<SetupStatus>('/api/setup'),
};
