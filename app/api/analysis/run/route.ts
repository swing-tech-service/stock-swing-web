import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  const adminKey = String(body.adminKey || '').trim();

  if (!adminKey || adminKey !== process.env.ADMIN_UPLOAD_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_CORE_REPO;
  const workflow = process.env.GITHUB_WORKFLOW_FILE || 'run_daily.yml';
  const ref = process.env.GITHUB_REF || 'main';

  if (!token || !owner || !repo) {
    return NextResponse.json({ error: 'GitHub workflow environment variables are missing' }, { status: 500 });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `GitHub Actions dispatch failed: ${res.status} ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
