import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SUGGESTED_ACTIVITIES } from '@fitness/shared';
import { api } from '../api';
import { todayStr } from '../dates';

export function CheckinDialog({ userId, onClose }: { userId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [activity, setActivity] = useState('跑步');
  const [duration, setDuration] = useState('30');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.createCheckin({
        userId,
        date,
        activity,
        durationMin: duration ? Number(duration) : null,
        note: note || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <h3>手动打卡</h3>
        <div className="field">
          <label htmlFor="ck-date">日期</label>
          <input id="ck-date" type="date" value={date} max={todayStr()} required
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ck-activity">运动（可自由填写）</label>
          <input id="ck-activity" list="activity-suggestions" value={activity} required maxLength={16}
            placeholder="跑步 / 攀岩 / 跳绳…" onChange={(e) => setActivity(e.target.value)} />
          <datalist id="activity-suggestions">
            {SUGGESTED_ACTIVITIES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="ck-duration">时长（分钟，可留空）</label>
          <input id="ck-duration" type="number" min="1" max="1440" value={duration}
            onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ck-note">备注（可留空）</label>
          <input id="ck-note" type="text" value={note} placeholder="如：5 公里 / 练腿"
            onChange={(e) => setNote(e.target.value)} />
        </div>
        {mutation.isError && <p className="error">{(mutation.error as Error).message}</p>}
        <div className="actions">
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? '记录中…' : '记录'}
          </button>
        </div>
      </form>
    </div>
  );
}
