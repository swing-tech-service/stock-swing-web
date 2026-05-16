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
  const run = runs.data?.[0] ?? null;
  if (!run) return NextResponse.json({ run: null, rows: [] });

  const results = await supabase
    .from('analysis_results')
    .select('*')
    .eq('run_id', run.id);

  if (results.error) return NextResponse.json({ error: results.error.message }, { status: 500 });

  const rows = (results.data ?? []).sort((a: any, b: any) => {
    const as = typeof a.score === 'number' && Number.isFinite(a.score) ? a.score : null;
    const bs = typeof b.score === 'number' && Number.isFinite(b.score) ? b.score : null;
    if (as === null && bs === null) return String(a.code).localeCompare(String(b.code), 'ja');
    if (as === null) return 1;
    if (bs === null) return -1;
    if (bs !== as) return bs - as;
    return String(a.code).localeCompare(String(b.code), 'ja');
  });

  return NextResponse.json({ run, rows });
}
