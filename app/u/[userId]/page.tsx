import { supabaseAdmin } from '@/lib/supabaseServer';

type ResultRow = {
  id: string;
  code: string;
  name: string | null;
  score: number | null;
  condition_count: number | null;
  failed_star_numbers: string | null;
  tags: string[] | null;
  close: number | null;
  metrics: Record<string, any> | null;
  kabutan_url: string | null;
};

async function getData(userId: string) {
  const supabase = supabaseAdmin();

  const runs = await supabase
    .from('analysis_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1);

  if (runs.error) {
    throw new Error(runs.error.message);
  }

  const run = runs.data?.[0] ?? null;
  if (!run) {
    return { run: null, rows: [] as ResultRow[] };
  }

  const results = await supabase
    .from('analysis_results')
    .select('*')
    .eq('run_id', run.id)
    .order('score', { ascending: false });

  if (results.error) {
    throw new Error(results.error.message);
  }

  return { run, rows: (results.data ?? []) as ResultRow[] };
}

function tagClass(t: string) {
  if (['TRADE READY', 'ボラOK', '出来高OK', '出来高強い', '損切り許容内', '小型株'].includes(t)) return 'green';
  if (['決算前除外', '出来高不足', 'ボラ不足', '損切り遠い'].includes(t)) return 'red';
  if (['決算直前注意', '直近安値接近'].includes(t)) return 'orange';
  if (['BBスクイーズブレイク', 'BB拡大中'].includes(t)) return 'blue';
  return 'gray';
}

function fmt(value: any, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${suffix}`;
}

export default async function Dashboard({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  let data: { run: any; rows: ResultRow[] };
  let errorMessage = '';

  try {
    data = await getData(userId);
  } catch (error) {
    data = { run: null, rows: [] };
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const rows = data.rows || [];
  const count = (tag: string) => rows.filter((r) => (r.tags || []).includes(tag)).length;

  return (
    <>
      <header className="hero">
        <div className="eyebrow">Premium Swing Screening</div>
        <h1>{userId} ダッシュボード</h1>
        <p className="meta">最終更新: {data.run?.finished_at || data.run?.started_at || '未実行'} / 毎日17:00 JST更新</p>
      </header>
      <main className="wrap">
        {errorMessage ? <div className="alert">エラー: {errorMessage}</div> : null}
        <div className="cards">
          <div className="card">監視銘柄<br /><b>{rows.length}</b></div>
          <div className="card">TRADE READY<br /><b>{count('TRADE READY')}</b></div>
          <div className="card">BBスクイーズ<br /><b>{count('BBスクイーズブレイク')}</b></div>
          <div className="card">ボラOK<br /><b>{count('ボラOK')}</b></div>
          <div className="card">出来高OK<br /><b>{count('出来高OK') + count('出来高強い')}</b></div>
        </div>
        <section className="section">
          <table>
            <thead>
              <tr>
                <th>コード</th><th>銘柄名</th><th>スコア</th><th>達成</th><th>未達★</th><th>タグ</th><th>現在値</th><th>損切り参考</th><th>損切り距離</th><th>利確20%</th><th>6か月値幅</th><th>株探</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={12}>まだ分析結果がありません。CSV登録後、core の GitHub Actions を実行してください。</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.code}</b></td>
                  <td>{r.name || ''}</td>
                  <td>{fmt(r.score)}</td>
                  <td>{fmt(r.condition_count)}</td>
                  <td>{fmt(r.failed_star_numbers)}</td>
                  <td>{(r.tags || []).map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}</td>
                  <td>{fmt(r.close)}</td>
                  <td>{fmt(r.metrics?.stop_loss_reference)}</td>
                  <td>{fmt(r.metrics?.stop_loss_distance_pct, '%')}</td>
                  <td>{fmt(r.metrics?.take_profit_20pct)}</td>
                  <td>{fmt(r.metrics?.six_month_range_pct, '%')}</td>
                  <td>{r.kabutan_url ? <a className="btn" href={r.kabutan_url} target="_blank" rel="noreferrer">株探</a> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
