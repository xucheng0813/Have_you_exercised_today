import type { Checkin, NewCheckin, Stats, WeeklyReport } from '@fitness/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  stats: () => request<Stats>('/api/stats'),
  checkins: (from: string, to: string) => request<Checkin[]>(`/api/checkins?from=${from}&to=${to}`),
  createCheckin: (body: NewCheckin) =>
    request<Checkin>('/api/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteCheckin: (id: number) => request<{ ok: boolean }>(`/api/checkins/${id}`, { method: 'DELETE' }),
  latestReport: () => request<WeeklyReport | null>('/api/reports/latest'),
};
