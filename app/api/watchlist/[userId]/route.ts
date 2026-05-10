import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = supabaseAdmin();
  const rows = await supabase.from('watchlists').select('*').eq('user_id', userId).order('code');
  return NextResponse.json({ rows: rows.data ?? [] });
}
