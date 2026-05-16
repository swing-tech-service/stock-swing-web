import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseServer';

function normalizeKey(raw: unknown) {
  return String(raw ?? '').trim();
}

export async function POST(req: Request) {
  const body = await req.json();
  const userId = String(body.userId || '').trim();
  const adminKey = normalizeKey(body.adminKey);

  if (!userId || !adminKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const user = await supabase
    .from('app_users')
    .select('id,admin_key,status')
    .eq('id', userId)
    .single();

  if (user.error || !user.data) {
    return NextResponse.json({ error: `user not found: ${userId}` }, { status: 404 });
  }
  if (user.data.status !== 'active') {
    return NextResponse.json({ error: `user is not active: ${userId}` }, { status: 403 });
  }

  const expectedKey = normalizeKey(user.data.admin_key || process.env.ADMIN_UPLOAD_KEY || '');
  if (!expectedKey || adminKey !== expectedKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token = process.env.GITHUB_ACTIONS_TOKEN || process.env.GITHUB_TOKEN_FOR_DISPATCH;
  const owner = process.env.GITHUB_OWNER || 'swing-tech-service';
  const repo = process.env.GITHUB_CORE_REPO || 'stock-swing-core';
  const workflow = process.env.GITHUB_WORKFLOW_ID || 'run_daily.yml';
  const ref = process.env.GITHUB_REF || 'main';

  if (!token) {
    return NextResponse.json({ error: 'GitHub workflow dispatch token is not configured' }, { status: 500 });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const gh = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref, inputs: { user_id: userId } }),
  });

  if (!gh.ok) {
    const text = await gh.text();
    return NextResponse.json({ error: `GitHub Actions dispatch failed: ${gh.status} ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: `${userId} のスコア判定更新を開始しました。数分後にダッシュボードを確認してください。` });
}
