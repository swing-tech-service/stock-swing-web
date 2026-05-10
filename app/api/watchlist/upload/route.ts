import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

function normalizeCode(raw: unknown) {
  const value = String(raw ?? '').trim().toUpperCase().replace('.T', '');
  if (!value) return '';
  return value;
}

export async function POST(req: Request) {
  const body = await req.json();
  const userId = String(body.userId || '').trim();
  const adminKey = String(body.adminKey || '').trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!userId || !adminKey || adminKey !== process.env.ADMIN_UPLOAD_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const user = await supabase.from('app_users').select('id,max_watchlist_count').eq('id', userId).single();
  if (user.error || !user.data) {
    return NextResponse.json({ error: `user not found: ${userId}` }, { status: 404 });
  }

  const items = rows
    .map((r: any) => ({
      user_id: userId,
      code: normalizeCode(r.code ?? r.Code ?? r['銘柄コード']),
      name: String(r.name ?? r.Name ?? r['銘柄名'] ?? '').trim(),
      is_active: true,
      updated_at: new Date().toISOString(),
    }))
    .filter((r: any) => r.code);

  const max = user.data.max_watchlist_count ?? 400;
  if (items.length > max) {
    return NextResponse.json({ error: `watchlist limit exceeded: ${items.length}/${max}` }, { status: 400 });
  }

  const del = await supabase.from('watchlists').delete().eq('user_id', userId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 });

  if (items.length > 0) {
    const ins = await supabase.from('watchlists').insert(items);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: items.length });
}
