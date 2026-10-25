import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status,
  headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
export async function POST(req: Request) {
  if (process.env.POC_ANALYSIS_ENABLED?.trim() === 'false') return reply({ error: '分析は現在停止中です' }, 503);
  try {
    if (!req.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'JSONが必要です' }, 415);
    // Browser-only same-origin entry point. No URL keys, permissive CORS or GET side effects.
    const expected = process.env.POC_ANALYSIS_ORIGIN?.trim().replace(/\/+$/, '') || new URL(req.url).origin;
    if (!expected || req.headers.get('origin') !== expected) return reply({ error: '送信元を確認してください' }, 403);
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: '入力が必要です' }, 400);
    let size = 0; const parts: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return reply({ error: '入力が大きすぎます' }, 413); }
      parts.push(value);
    }
    let b: any;
    try { b = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return reply({ error: 'JSONが不正です' }, 400); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return reply({ error: '入力が不正です' }, 400);
    const db = supabaseAdmin();
    const validId = (s: unknown) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s);
    if (!validId(b.user) || !validId(b.target)) return reply({error:'本人ID・対象を確認してください'},403);
    const isAdmin = typeof b.adminKey === 'string' && b.adminKey.trim().length > 0;
    if(isAdmin) {
      if(b.user !== 'takashimasaakiadmin' || b.target !== b.user || b.adminKey.length>256)
        return reply({error:'管理者認証が必要です'},403);
      const auth=await db.from('app_users').select('id,admin_key,status').eq('id','takashimasaakiadmin').maybeSingle();
      if(auth.error) return reply({error:'管理者認証を確認できません'},503);
      const expectedKey=String(auth.data?.admin_key || process.env.ADMIN_UPLOAD_KEY || '').trim();
      const supplied=Buffer.from(b.adminKey.trim()); const stored=Buffer.from(expectedKey);
      if(!auth.data || auth.data.status!=='active' || !expectedKey || supplied.length!==stored.length || !timingSafeEqual(supplied,stored))
        return reply({error:'管理者認証が必要です'},403);
    } else if(typeof b.key!=='string' || b.key.length<16 || b.key.length>256) {
      return reply({error:'協力者キーを確認してください'},403);
    }
    if(b.action==='availability') {
      if(!isAdmin) return reply({error:'管理者認証が必要です'},403);
      const setting=await db.from('poc_analysis_rollout').select('mode').eq('singleton',true).maybeSingle();
      const available=!setting.error && ['admin','u001'].includes(setting.data?.mode);
      return reply({available,...(!available?{reason:setting.error?'分析用SQLが未適用、または設定の取得に失敗しました。20261025_poc_analysis_admin_rollout.sqlの適用を確認してください。':setting.data?.mode==='off'?'分析は公開設定で停止中です。':'分析の公開設定がありません。追加SQLの適用を確認してください。'}:{})});
    }
    if (!['create','status'].includes(b.action)) return reply({ error: '操作が不正です' }, 400);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if ((b.action === 'create' || b.request_id != null) && (typeof b.request_id !== 'string' || !uuid.test(b.request_id)))
      return reply({ error: '要求IDが不正です' }, 400);
    let code: string | null = null;
    if (b.action === 'create') {
      if (typeof b.code !== 'string') return reply({ error: '銘柄コードを入力してください' }, 400);
      code = b.code.normalize('NFKC').trim().toUpperCase().replace(/\.T$/, '');
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Tokyo' }).format(new Date());
      const date = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
        Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10) === s && s >= '2000-01-01' && s < today;
      if (!/^\d{3}[\dA-Z]$/.test(code) || !date(b.buy_date) || !date(b.sell_date) || b.sell_date < b.buy_date)
        return reply({ error: 'コード、昨日までの日付、買付日と売却日の順序を確認してください' }, 400);
    }
    const { data, error } = await db.rpc('poc_analysis_access', {
      p_user: b.user, p_target: b.target, p_hash: isAdmin ? '' : createHash('sha256').update(b.key).digest('hex'), p_admin: isAdmin,
      p_action: b.action, p_request: b.request_id ?? null, p_code: code,
      p_buy: b.action === 'create' ? b.buy_date : null, p_sell: b.action === 'create' ? b.sell_date : null,
    });
    if (error || !data) return reply({ error: '分析サービスに接続できません。要求IDを変えず再確認してください' }, 503);
    const { _wake_worker, ...output } = data;
    // Wake only for a newly created calculation. Cache hits and retries never dispatch.
    // The schedule drains the durable queue when dispatch cannot be confirmed.
    const token=(process.env.POC_ANALYSIS_GITHUB_TOKEN || process.env.GITHUB_ACTIONS_TOKEN || process.env.GITHUB_TOKEN_FOR_DISPATCH || '').trim();
    let workerNotice: string | undefined;
    if(_wake_worker === true && token) {
      const owner=process.env.GITHUB_OWNER?.trim() || 'swing-tech-service';
      const repo=process.env.GITHUB_CORE_REPO?.trim() || 'stock-swing-core';
      try {
        const response=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/poc_analysis.yml/dispatches`, {
          method:'POST',signal:AbortSignal.timeout(5000),
          headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
          body:JSON.stringify({ref:process.env.POC_ANALYSIS_REF?.trim() || 'main'}),
        });
        if(!response.ok) workerNotice=`受付は保存済みです。即時起動は確認できませんでした（GitHub HTTP ${response.status}）。定期処理を待つか、管理者がPoC analysis queueを手動実行してください。`;
      } catch { workerNotice='受付は保存済みです。即時起動の通信に失敗しました。定期処理を待つか、管理者がPoC analysis queueを手動実行してください。'; }
    }
    return reply({...output,...(workerNotice?{worker_notice:workerNotice}:{})}, data.http || (data.status === 'queued' || data.status === 'running' ? 202 : 200));
  } catch { return reply({ error: '分析サービスに接続できません。時間をおいて再確認してください' }, 503); }
}
