import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

function normalizeCode(raw: string) {
  let s = String(raw || '').trim().toUpperCase().replace(/\.T$/, '').replace(/\s|-/g, '');
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  const m = s.match(/^(\d{3,4})([A-Z])$/);
  if (m) {
    let num = m[1];
    if (num.length === 4 && num.startsWith('0')) num = num.slice(1);
    return `${num}${m[2]}`;
  }
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{3}$/.test(s)) return s.padStart(4, '0');
  return '';
}

export async function POST(req: Request) {
  const body = await req.json();
  const { userId, adminKey, rows } = body;
  if (!userId || !adminKey || adminKey !== process.env.ADMIN_UPLOAD_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows must be array' }, { status: 400 });
  const supabase = supabaseAdmin();
  const payload = rows.map((r: any) => ({
    user_id: userId,
    code: normalizeCode(r.code),
    name: String(r.name || ''),
    memo: String(r.memo || ''),
    is_active: true,
  })).filter((r: any) => r.code);
  if (payload.length > 500) return NextResponse.json({ error: 'too many rows' }, { status: 400 });
  await supabase.from('watchlists').delete().eq('user_id', userId);
  const result = await supabase.from('watchlists').insert(payload);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: payload.length });
}
