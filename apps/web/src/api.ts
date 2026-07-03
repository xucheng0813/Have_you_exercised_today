import type {
  AdminUserSummary,
  Checkin,
  CheckinWithUser,
  NewCheckin,
  SetupStatus,
  Stats,
  User,
  WeeklyReport,
} from '@fitness/shared';

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
  saveFeishu: (appId: string, appSecret: string) =>
    request<{ ok: boolean }>('/api/setup/feishu', post({ appId, appSecret })),
  saveDeepseek: (apiKey: string) => request<{ ok: boolean }>('/api/setup/deepseek', post({ apiKey })),
  adminUsers: () => request<AdminUserSummary[]>('/api/admin/users'),
  adminCheckins: (limit = 30) => request<CheckinWithUser[]>(`/api/admin/checkins?limit=${limit}`),
  renameUser: (id: number, name: string) =>
    request<User>(`/api/users/${id}`, { ...post({ name }), method: 'PATCH' }),
  deleteUser: (id: number) => request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
  generateReport: (userId: number) =>
    request<{ content: string | null }>(`/api/reports/generate?userId=${userId}`, { method: 'POST' }),
};
