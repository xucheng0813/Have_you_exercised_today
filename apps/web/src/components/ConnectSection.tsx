import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { api } from '../api';

function StatusChip({ tone, children }: { tone: 'ok' | 'wait' | 'off'; children: string }) {
  return <span className={`status-chip ${tone}`}>{children}</span>;
}

function FeishuQR({ appId }: { appId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    // 飞书 applink：扫码直接打开机器人会话
    void QRCode.toDataURL(`https://applink.feishu.cn/client/bot/open?appId=${appId}`, {
      width: 176,
      margin: 1,
      color: { dark: '#1d1d1f', light: '#ffffff' },
    }).then(setSrc);
  }, [appId]);
  if (!src) return null;
  return <img className="feishu-qr" src={src} alt="飞书机器人二维码" width={148} height={148} />;
}

/** 一次性配置：粘贴自建应用凭证，保存即校验并热启动长连接 */
function FeishuSetupForm() {
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const save = useMutation({
    mutationFn: () => api.saveFeishu(appId.trim(), appSecret.trim()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['setup'] }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (appId.trim() && appSecret.trim()) save.mutate();
  };
  return (
    <form className="feishu-setup" onSubmit={submit}>
      <p className="connect-text">
        一次性配置：在
        <a href="https://open.feishu.cn" target="_blank" rel="noreferrer">飞书开放平台</a>
        创建自建应用（权限开 <code>im:message</code> 收发，事件订阅选「长连接」并添加接收消息事件，发布），
        把凭证粘贴到这里。保存即生效，之后所有人扫码即用。
      </p>
      <input value={appId} placeholder="App ID（cli_ 开头）" aria-label="App ID"
        onChange={(e) => setAppId(e.target.value)} />
      <input value={appSecret} type="password" placeholder="App Secret" aria-label="App Secret"
        onChange={(e) => setAppSecret(e.target.value)} />
      <button type="submit" className="btn-primary sm" disabled={save.isPending || !appId.trim() || !appSecret.trim()}>
        {save.isPending ? '校验中…' : '保存并连接'}
      </button>
      {save.isError && <p className="form-error">{(save.error as Error).message}</p>}
    </form>
  );
}

export function ConnectSection() {
  const { data: setup } = useQuery({
    queryKey: ['setup'],
    queryFn: api.setup,
    // 待扫码时轮询，扫完自动翻到「已连接」
    refetchInterval: (q) => {
      const s = q.state.data;
      return s?.feishu.configured && s.feishu.boundUsers === 0 ? 5_000 : 60_000;
    },
  });
  if (!setup) return null;

  const { feishu, deepseek } = setup;

  return (
    <>
      <div className="card connect-card">
          <div className="connect-head">
            <p className="card-title">飞书机器人</p>
            {feishu.boundUsers > 0 ? (
              <StatusChip tone="ok">{`已连接 · ${feishu.boundUsers} 人`}</StatusChip>
            ) : feishu.configured ? (
              <StatusChip tone="wait">待扫码</StatusChip>
            ) : (
              <StatusChip tone="off">未配置</StatusChip>
            )}
          </div>
          {feishu.configured && feishu.appId ? (
            <>
              <p className="connect-text">
                用飞书「扫一扫」打开机器人，发一句话即自动加入——每个扫码的人都有自己的打卡档案；
                每天 21:00 没打卡会提醒，周一早上推送各自的教练周报。
              </p>
              <FeishuQR appId={feishu.appId} />
            </>
          ) : (
            <FeishuSetupForm />
          )}
      </div>
      <div className="card connect-card">
          <div className="connect-head">
            <p className="card-title">DeepSeek</p>
            {deepseek.configured ? (
              <StatusChip tone="ok">已启用</StatusChip>
            ) : (
              <StatusChip tone="off">未配置</StatusChip>
            )}
          </div>
          {deepseek.configured ? (
            <p className="connect-text">
              模型 {deepseek.model}。打卡消息由 DeepSeek 识别——跑步、攀岩、跳绳，想练什么都认得；
              每周一自动生成教练点评。
            </p>
          ) : (
            <p className="connect-text">
              当前用内置规则解析消息，只认常见运动。把 DEEPSEEK_API_KEY 填入 .env
              后，任意运动都能识别，并解锁每周 AI 教练点评。
            </p>
          )}
      </div>
    </>
  );
}
