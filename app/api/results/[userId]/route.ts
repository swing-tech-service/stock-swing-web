import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseServer';

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = supabaseAdmin();
  const runs = await supabase
    .from('analysis_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1);

  if (runs.error) return NextResponse.json({ error: runs.error.message }, { status: 500 });
  const run = runs.data?.[0];
  if (!run) return NextResponse.json({ run: null, rows: [] });

  const rows = await supabase
    .from('analysis_results')
    .select('*')
    .eq('run_id', run.id)
    .order('score', { ascending: false });

  if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500 });
  return NextResponse.json({ run, rows: rows.data ?? [] });
}
