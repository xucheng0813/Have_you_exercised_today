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

const WS_STATE_LABEL: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: '长连接在线，能实时收到消息' },
  connecting: { ok: false, text: '长连接正在建立…稍等几秒再检查一次' },
  reconnecting: { ok: false, text: '长连接反复重连——去开发者后台确认「事件与回调 → 订阅方式」选了「使用长连接接收事件」' },
  failed: { ok: false, text: '长连接失败——确认订阅方式选了「长连接」，且应用类型为企业自建应用' },
  idle: { ok: false, text: '长连接未建立——确认订阅方式选了「长连接」' },
  not_started: { ok: false, text: '长连接未启动——保存凭证后自动启动' },
};

function CheckItem({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return (
    <li className={ok ? 'ok' : 'bad'}>
      <span className="check-mark">{ok ? '✓' : '✕'}</span>
      <span>
        {label}
        {detail && <em>{detail}</em>}
      </span>
    </li>
  );
}

/** 逐项自检：凭证 → 机器人 → 长连接 → 成员加入 */
function FeishuDiagnostics() {
  const { data: check, refetch, isFetching } = useQuery({
    queryKey: ['feishu-check'],
    queryFn: api.feishuCheck,
    enabled: false,
  });
  return (
    <div className="feishu-check">
      <button type="button" className="text-btn" onClick={() => void refetch()} disabled={isFetching}>
        {isFetching ? '检查中…' : check ? '重新检查' : '扫码没反应？点这里自检'}
      </button>
      {check && (
        <ul className="check-list">
          <CheckItem ok={check.credentialsValid} label="应用凭证有效" detail={check.credentialsError} />
          <CheckItem
            ok={check.botName !== null}
            label={check.botName ? `机器人「${check.botName}」能力已开启` : '机器人能力'}
            detail={check.botError}
          />
          <CheckItem
            ok={WS_STATE_LABEL[check.wsState]?.ok ?? false}
            label="事件长连接"
            detail={WS_STATE_LABEL[check.wsState]?.text}
          />
          <CheckItem
            ok={check.boundUsers > 0}
            label={check.boundUsers > 0 ? `已有 ${check.boundUsers} 人加入` : '还没有人成功发过消息'}
            detail={
              check.boundUsers === 0
                ? '扫码打不开机器人会话 → 应用需在开发者后台「创建版本并发布」，可用范围要包含你；能打开但发消息无回应 → 事件订阅里要添加「接收消息 im.message.receive_v1」，并开通 im:message 相关权限后重新发布版本'
                : null
            }
          />
        </ul>
      )}
    </div>
  );
}

/** 粘贴 DeepSeek key，保存即校验并生效（存本地 SQLite） */
function DeepseekSetupForm() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const save = useMutation({
    mutationFn: () => api.saveDeepseek(apiKey.trim()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['setup'] }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) save.mutate();
  };
  return (
    <form className="feishu-setup" onSubmit={submit}>
      <p className="connect-text">
        当前用内置规则解析消息，只认常见运动。在
        <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer">platform.deepseek.com</a>
        创建 API key 粘贴到这里，任意运动都能识别，并解锁每周 AI 教练点评。
      </p>
      <input value={apiKey} type="password" placeholder="API key（sk- 开头）" aria-label="DeepSeek API key"
        onChange={(e) => setApiKey(e.target.value)} />
      <button type="submit" className="btn-primary sm" disabled={save.isPending || !apiKey.trim()}>
        {save.isPending ? '校验中…' : '保存并启用'}
      </button>
      {save.isError && <p className="form-error">{(save.error as Error).message}</p>}
    </form>
  );
}

/** 粘贴自建应用凭证，保存即校验并重连长连接；首次配置与更换凭证共用 */
function FeishuSetupForm({ initialAppId = '', onDone }: { initialAppId?: string; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState(initialAppId);
  const [appSecret, setAppSecret] = useState('');
  const save = useMutation({
    mutationFn: () => api.saveFeishu(appId.trim(), appSecret.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['setup'] });
      onDone?.();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (appId.trim() && appSecret.trim()) save.mutate();
  };
  return (
    <form className="feishu-setup" onSubmit={submit}>
      <p className="connect-text">
        在
        <a href="https://open.feishu.cn" target="_blank" rel="noreferrer">飞书开放平台</a>
        创建自建应用（权限开 <code>im:message</code> 收发，事件订阅选「长连接」并添加接收消息事件，发布），
        把凭证粘贴到这里。保存即生效，之后所有人扫码即用。
      </p>
      <input value={appId} placeholder="App ID（cli_ 开头）" aria-label="App ID"
        onChange={(e) => setAppId(e.target.value)} />
      <input value={appSecret} type="password" placeholder="App Secret" aria-label="App Secret"
        onChange={(e) => setAppSecret(e.target.value)} />
      <div className="setup-actions">
        <button type="submit" className="btn-primary sm" disabled={save.isPending || !appId.trim() || !appSecret.trim()}>
          {save.isPending ? '校验中…' : '保存并连接'}
        </button>
        {onDone && <button type="button" className="text-btn" onClick={onDone}>取消</button>}
      </div>
      {save.isError && <p className="form-error">{(save.error as Error).message}</p>}
    </form>
  );
}

export function ConnectSection() {
  const [editingFeishu, setEditingFeishu] = useState(false);
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
            <span className="connect-head-right">
              {feishu.configured && !editingFeishu && (
                <button className="text-btn" onClick={() => setEditingFeishu(true)}>更换凭证</button>
              )}
              {feishu.boundUsers > 0 ? (
                <StatusChip tone="ok">{`已连接 · ${feishu.boundUsers} 人`}</StatusChip>
              ) : feishu.configured ? (
                <StatusChip tone="wait">待扫码</StatusChip>
              ) : (
                <StatusChip tone="off">未配置</StatusChip>
              )}
            </span>
          </div>
          {feishu.configured && feishu.appId && !editingFeishu ? (
            <>
              <p className="connect-text">
                用飞书「扫一扫」打开机器人，发一句话即自动加入——每个扫码的人都有自己的打卡档案；
                每天 21:00 没打卡会提醒，周一早上推送各自的教练周报。
              </p>
              <FeishuQR appId={feishu.appId} />
              <FeishuDiagnostics />
            </>
          ) : feishu.configured ? (
            <FeishuSetupForm initialAppId={feishu.appId ?? ''} onDone={() => setEditingFeishu(false)} />
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
            <DeepseekSetupForm />
          )}
      </div>
    </>
  );
}
