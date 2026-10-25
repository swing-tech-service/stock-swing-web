import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseServer';
import { validateTrade } from '../../../../lib/tradeReview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: '入力が不正です' }, 400);
    const userId = String(body.userId || '').trim();
    const adminKey = String(body.adminKey || '').trim();
    if (!userId || !adminKey) return reply({ error: '管理認証が必要です' }, 401);
    if (userId !== 'takashimasaakiadmin') return reply({ error: 'この機能はスコア閲覧管理者専用です' }, 403);
    const db = supabaseAdmin();
    const user = await db.from('app_users').select('id,admin_key,status').eq('id', userId).maybeSingle();
    if (user.error) return reply({ error: '管理認証の確認に失敗しました' }, 503);
    const expected = String(user.data?.admin_key || process.env.ADMIN_UPLOAD_KEY || '').trim();
    if (!user.data || !expected || adminKey !== expected) return reply({ error: '管理認証に失敗しました' }, 401);
    if (user.data.status !== 'active') return reply({ error: '無効なユーザーです' }, 403);

    if (body.action === 'list') {
      const rows = await db.from('trade_review_jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
      if (rows.error) return reply({ error: '履歴取得に失敗しました。SQL適用を確認してください' }, 503);
      return reply({ jobs: rows.data });
    }
    if (body.action !== 'create') return reply({ error: '不正な操作です' }, 400);
    let input;
    try {
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
      input = validateTrade(body, today);
    } catch (e) { return reply({ error: e instanceof Error ? e.message : '入力エラー' }, 400); }
    const token = process.env.GITHUB_ACTIONS_TOKEN || process.env.GITHUB_TOKEN_FOR_DISPATCH;
    if (!token) return reply({ error: 'GitHub Actions用トークンが未設定です' }, 503);
    // An interrupted Action cannot leave the user permanently locked out.
    const expired = await db.from('trade_review_jobs').update({ status: 'failed', error_message: '30分以内に完了しませんでした。再実行してください。', finished_at: new Date().toISOString() })
      .eq('user_id', userId).in('status', ['queued', 'running']).lt('created_at', new Date(Date.now() - 30 * 60_000).toISOString());
    if (expired.error) return reply({ error: '検証状態を更新できませんでした' }, 503);
    const pending = await db.from('trade_review_jobs').select('id').eq('user_id', userId).in('status', ['queued', 'running']).limit(1);
    if (pending.error) return reply({ error: '検証状態を確認できませんでした' }, 503);
    if (pending.data?.length) return reply({ error: '実行中の検証があります。履歴を更新してください（30分経過後は再実行可能）' }, 409);
    const saved = await db.from('trade_review_jobs').insert({ user_id: userId, ...input }).select('id').single();
    if (saved.error || !saved.data) return reply({ error: '検証を登録できませんでした。SQL適用または実行中の検証を確認してください' }, 409);
    const owner = process.env.GITHUB_OWNER || 'swing-tech-service';
    const repo = process.env.GITHUB_CORE_REPO || 'stock-swing-core';
    const ref = process.env.GITHUB_REF || 'main';
    let dispatched = false;
    try {
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/trade_review.yml/dispatches`, {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, inputs: { job_id: saved.data.id } }),
      });
      dispatched = response.ok;
    } catch { /* The claim/status guard makes a late dispatch harmless. */ }
    if (!dispatched) {
      const failed = await db.from('trade_review_jobs').update({ status: 'failed', error_message: 'Actions起動を確認できませんでした。設定・権限を確認してください。', finished_at: new Date().toISOString() }).eq('id', saved.data.id).eq('status', 'queued');
      return reply({ error: failed.error ? 'Actions起動・状態保存を確認できませんでした。履歴を更新してください' : 'Actions起動を確認できませんでした。履歴とGitHub設定を確認してください' }, 502);
    }
    return reply({ id: saved.data.id, message: '検証を受け付けました。数分後に履歴を更新してください。' }, 202);
  } catch { return reply({ error: '過去検証サービスに接続できませんでした' }, 503); }
}
