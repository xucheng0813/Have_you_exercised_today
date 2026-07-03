import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  return <img className="feishu-qr" src={src} alt="飞书机器人二维码" width={176} height={176} />;
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
    <div className="sect parchment">
      <div className="sect-head"><h2>接入</h2></div>
      <div className="panel-grid connect-grid">
        <div className="panel connect-card">
          <div className="connect-head">
            <p className="p-title">飞书机器人</p>
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
            <p className="connect-text">
              在飞书开放平台创建自建应用，开通消息权限并选择「长连接接收事件」（无需公网地址），
              把 App ID / Secret 填入 .env 后重启服务，这里就会出现绑定二维码。
            </p>
          )}
        </div>
        <div className="panel connect-card">
          <div className="connect-head">
            <p className="p-title">DeepSeek</p>
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
      </div>
    </div>
  );
}
