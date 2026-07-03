import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { weekdayLabel } from './dates';
import { ConnectSection } from './components/ConnectSection';

function MembersCard() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: api.adminUsers });
  const invalidate = () => void queryClient.invalidateQueries();
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.renameUser(id, name),
    onSuccess: invalidate,
  });
  const del = useMutation({ mutationFn: api.deleteUser, onSuccess: invalidate });
  const create = useMutation({ mutationFn: api.createUser, onSuccess: invalidate });

  return (
    <div className="card">
      <div className="card-head">
        <p className="card-title">成员管理</p>
        <button
          className="text-btn"
          onClick={() => {
            const name = window.prompt('新成员名字：')?.trim();
            if (name) create.mutate(name);
          }}
        >
          ＋ 添加成员
        </button>
      </div>
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr><th>成员</th><th>飞书</th><th>打卡数</th><th>最后打卡</th><th></th></tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="t-name">{u.name}</td>
                <td>
                  {u.feishuOpenId ? (
                    <span className="status-chip ok">已绑定</span>
                  ) : (
                    <span className="status-chip off">未绑定</span>
                  )}
                </td>
                <td className="t-num">{u.checkinCount}</td>
                <td className="t-num">{u.lastDate ?? '—'}</td>
                <td className="t-actions">
                  <button
                    className="text-btn"
                    onClick={() => {
                      const name = window.prompt(`「${u.name}」改名为：`, u.name)?.trim();
                      if (name && name !== u.name) rename.mutate({ id: u.id, name });
                    }}
                  >
                    重命名
                  </button>
                  <button
                    className="text-btn danger"
                    onClick={() =>
                      window.confirm(`删除成员「${u.name}」？其全部 ${u.checkinCount} 条打卡记录和周报会一并删除。`) &&
                      del.mutate(u.id)
                    }
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(rename.isError || del.isError) && (
        <p className="form-error">{((rename.error ?? del.error) as Error).message}</p>
      )}
    </div>
  );
}

function ReportsCard() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: api.adminUsers });
  const { data: setup } = useQuery({ queryKey: ['setup'], queryFn: api.setup });
  const gen = useMutation({
    mutationFn: api.generateReport,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['report'] }),
  });
  const canGenerate = setup?.deepseek.configured ?? false;

  return (
    <div className="card">
      <div className="card-head">
        <p className="card-title">AI 周报</p>
        <span className="card-hint">每周一自动生成 · 也可手动补</span>
      </div>
      {!canGenerate && <p className="connect-text">未配置 DeepSeek，无法生成周报。</p>}
      <ul className="report-list">
        {(users ?? []).map((u) => (
          <li key={u.id}>
            <span className="t-name">{u.name}</span>
            <button
              className="text-btn"
              disabled={!canGenerate || gen.isPending}
              onClick={() => gen.mutate(u.id)}
            >
              {gen.isPending && gen.variables === u.id ? '生成中…' : '生成上周周报'}
            </button>
          </li>
        ))}
      </ul>
      {gen.isError && <p className="form-error">{(gen.error as Error).message}</p>}
      {gen.isSuccess && (
        <p className="connect-text">{gen.data.content ? `已生成：${gen.data.content.slice(0, 60)}…` : '生成完成'}</p>
      )}
    </div>
  );
}

function AllRecordsCard() {
  const queryClient = useQueryClient();
  const { data: records } = useQuery({ queryKey: ['admin-checkins'], queryFn: () => api.adminCheckins(30) });
  const del = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number }) => api.deleteCheckin(id, userId),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  return (
    <div className="card">
      <div className="card-head">
        <p className="card-title">全部记录</p>
        <span className="card-hint">最近 30 条 · 所有成员</span>
      </div>
      {(records ?? []).length === 0 ? (
        <p className="recent-empty">还没有任何记录。</p>
      ) : (
        <ul className="recent">
          {(records ?? []).map((c) => (
            <li key={c.id}>
              <span className="r-date">{c.date.slice(5)} {weekdayLabel(c.date)}</span>
              <span className="r-user">{c.userName}</span>
              <span className="r-type">{c.activity}</span>
              <span className="r-dur">
                {[c.durationMin ? `${c.durationMin} 分钟` : null, c.note].filter(Boolean).join(' · ')}
              </span>
              <span className="r-right">
                <span className="r-src">{c.source === 'feishu' ? '飞书' : '网页'}</span>
                <button className="r-del" title="删除这条记录" aria-label="删除这条记录"
                  onClick={() =>
                    window.confirm(`删除 ${c.userName} ${c.date} 的${c.activity}记录？`) &&
                    del.mutate({ id: c.id, userId: c.userId })
                  }>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminPage() {
  return (
    <main className="grid">
      <div className="g7"><MembersCard /></div>
      <div className="g5 col"><ConnectSection /></div>
      <div className="g7"><AllRecordsCard /></div>
      <div className="g5"><ReportsCard /></div>
    </main>
  );
}
