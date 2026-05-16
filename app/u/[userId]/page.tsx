import { supabaseAdmin } from '../../../lib/supabaseServer';
import Link from 'next/link';

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

  if (runs.error) throw new Error(runs.error.message);
  const run = runs.data?.[0] ?? null;
  if (!run) return { run: null, rows: [] as ResultRow[] };

  const results = await supabase
    .from('analysis_results')
    .select('*')
    .eq('run_id', run.id);

  if (results.error) throw new Error(results.error.message);

  const rows = ((results.data ?? []) as ResultRow[]).sort((a, b) => {
    const as = typeof a.score === 'number' && Number.isFinite(a.score) ? a.score : null;
    const bs = typeof b.score === 'number' && Number.isFinite(b.score) ? b.score : null;
    if (as === null && bs === null) return String(a.code).localeCompare(String(b.code));
    if (as === null) return 1;
    if (bs === null) return -1;
    return bs - as;
  });

  return { run, rows };
}

function tagClass(t: string) {
  if (['決算前除外', '出来高不足', 'ボラ不足', '損切り遠い'].includes(t)) return 'red';
  if (['決算直前注意', '直近安値接近'].includes(t)) return 'orange';
  if (['BBスクイーズブレイク', 'BB拡大中'].includes(t)) return 'blue';
  if (['小型株', '損切り許容内'].includes(t)) return 'green';
  return 'gray';
}

function fmt(value: any, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${suffix}`;
}

function formatJst(value: any) {
  if (!value) return '未実行';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date) + ' JST';
}

function formatMd(value: any) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const m = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric' });
  const d = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', day: '2-digit' });
  return `${m}/${d}`;
}

const HIDDEN_TAGS = new Set(['TRADE READY', 'ボラOK', '出来高OK', '出来高強い']);

function visibleTags(row: ResultRow) {
  const tags = (row.tags || []).filter((t) => !HIDDEN_TAGS.has(t));
  const earningsTag = row.tags?.find((t) => ['決算直前注意', '決算前除外'].includes(t));
  const earningsDate = row.metrics?.next_earnings_date || row.metrics?.earnings_date;
  const md = formatMd(earningsDate);
  if (earningsTag && md) {
    tags.push(`決算日:${md}`);
  }
  return Array.from(new Set(tags));
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
  const lastUpdated = formatJst(data.run?.finished_at || data.run?.started_at);

  return (
    <>
      <header className="hero">
        <div className="eyebrow">Premium Swing Screening</div>
        <h1>{userId} ダッシュボード</h1>
        <p className="meta">最終更新: {lastUpdated} / 毎日17:00 JST頃更新（16:30頃から処理開始）</p>
      </header>
      <main className="wrap">
        {errorMessage ? <div className="alert">エラー: {errorMessage}</div> : null}
        <div className="cards">
          <div className="card">監視銘柄<br /><b>{rows.length}</b></div>
          <div className="card">BBスクイーズ<br /><b>{count('BBスクイーズブレイク')}</b></div>
          <div className="card">決算直前注意<br /><b>{count('決算直前注意')}</b></div>
          <div className="card">決算前除外<br /><b>{count('決算前除外')}</b></div>
          <div className="card">対象外/未判定<br /><b>{rows.filter((r) => typeof r.score !== 'number').length}</b></div>
        </div>
        <section className="section">
          <table>
            <thead>
              <tr>
                <th>コード</th><th>銘柄名</th><th>スコア</th><th>達成</th><th>未達★</th><th>タグ</th><th>現在値</th><th>詳細</th><th>株探</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9}>まだ分析結果がありません。CSV登録後、core のGitHub Actionsを実行してください。</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.code}</b></td>
                  <td>{r.name || ''}</td>
                  <td>{fmt(r.score)}</td>
                  <td>{fmt(r.condition_count)}</td>
                  <td>{fmt(r.failed_star_numbers)}</td>
                  <td>{visibleTags(r).map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}</td>
                  <td>{fmt(r.close)}</td>
                  <td><Link className="btn" href={`/u/${userId}/score/${r.code}`}>スコア詳細</Link></td>
                  <td>{r.kabutan_url ? <a className="btn" href={r.kabutan_url} target="_blank" rel="noreferrer">株探</a> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="section" style={{ marginTop: 24 }}>
          <h2>CSV登録・更新</h2>
          <p>監視銘柄CSVを変更する場合は、下記の管理画面から更新してください。CSV更新後は管理画面の「スコア判定を更新」ボタンで再分析を開始できます。</p>
          <Link className="btn" href={`/u/${userId}/admin`}>CSV更新ページへ</Link>
        </section>
      </main>
    </>
  );
}
