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
    if (as === null && bs === null) return String(a.code).localeCompare(String(b.code), 'ja');
    if (as === null) return 1;
    if (bs === null) return -1;
    if (bs !== as) return bs - as;
    return String(a.code).localeCompare(String(b.code), 'ja');
  });

  return { run, rows };
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
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date) + ' JST';
}

function formatMd(value: any) {
  if (!value) return '';
  const raw = String(value);
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${Number(m[2])}月${Number(m[3])}日`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(date).replace('/', '月') + '日';
}

const HIDDEN_TAGS = new Set([
  'TRADE READY', 'TRADEREADY',
  'ボラOK', 'ボラ不足', 'ボラ判定不可',
  '出来高OK', '出来高強い', '出来高不足', '出来高判定不可',
  '損切り許容内', '損切り遠い', '直近安値接近',
]);

function tagClass(t: string) {
  if (['決算前除外'].includes(t)) return 'red';
  if (['決算直前注意'].includes(t)) return 'orange';
  if (['BBブレイク', 'BB拡大中'].includes(t)) return 'blue';
  if (['小型株'].includes(t)) return 'green';
  if (t.startsWith('決算日:')) return 'orange';
  if (t.includes('レンジ最大')) return 'purple';
  if (t.includes('レンジ最小')) return 'green';
  if (t.includes('レンジ内')) return 'blue';
  return 'gray';
}

function visibleTags(row: ResultRow) {
  const tags = (row.tags || [])
    .map((t) => t === 'BBスクイーズブレイク' ? 'BBブレイク' : t)
    .filter((t) => !HIDDEN_TAGS.has(t));

  const earningsTag = tags.find((t) => ['決算直前注意', '決算前除外'].includes(t));
  const earningsDate = row.metrics?.next_earnings_date || row.metrics?.earnings_date;
  const md = formatMd(earningsDate);
  if (earningsTag && md) tags.push(`決算日:${md}`);

  return Array.from(new Set(tags));
}

function kabutanUrl(row: ResultRow) {
  return `https://kabutan.jp/stock/chart?code=${encodeURIComponent(String(row.code))}`;
}

function CompactRow({ row, userId, unscored = false }: { row: ResultRow; userId: string; unscored?: boolean }) {
  const tags = visibleTags(row);
  return (
    <div className={`stock-line ${unscored ? 'unscored' : ''}`}>
      <div className="line-main">
        <span className="line-code">{row.code}</span>
        <span className="line-name">{row.name || ''}</span>
      </div>
      <div className="line-score">
        <span>S</span><b>{unscored ? '-' : fmt(row.score)}</b>
      </div>
      {!unscored ? <div className="line-score compact"><span>達</span><b>{fmt(row.condition_count)}</b></div> : null}
      <div className="line-tags">
        {tags.map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}
      </div>
      <div className="line-actions">
        {!unscored ? <Link className="mini-btn" href={`/u/${userId}/score/${row.code}`}>詳細</Link> : null}
        <a className="mini-btn" href={kabutanUrl(row)} target="_blank" rel="noreferrer">株探</a>
      </div>
    </div>
  );
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
  const scoredRows = rows.filter((r) => typeof r.score === 'number' && Number.isFinite(r.score));
  const unscoredRows = rows.filter((r) => !(typeof r.score === 'number' && Number.isFinite(r.score)));
  const count = (tag: string) => rows.filter((r) => (r.tags || []).includes(tag)).length;
  const lastUpdated = formatJst(data.run?.finished_at || data.run?.started_at);

  return (
    <>
      <header className="hero compact-hero">
        <div className="eyebrow">Premium Swing Screening</div>
        <h1>{userId}</h1>
        <p className="meta">最終更新: {lastUpdated} / 毎日16:30 JST頃から更新開始（17:00までに反映目標）</p>
      </header>
      <main className="wrap compact-wrap">
        {errorMessage ? <div className="alert">エラー: {errorMessage}</div> : null}
        <div className="cards compact-cards">
          <div className="card">監視<br /><b>{rows.length}</b></div>
          <div className="card">判定<br /><b>{scoredRows.length}</b></div>
          <div className="card">対象外<br /><b>{unscoredRows.length}</b></div>
          <div className="card">BB<br /><b>{count('BBブレイク') + count('BBスクイーズブレイク')}</b></div>
          <div className="card">決算注意<br /><b>{count('決算直前注意')}</b></div>
          <div className="card">決算除外<br /><b>{count('決算前除外')}</b></div>
        </div>

        <section className="section compact-section">
          <div className="section-headline"><h2>スコア判定銘柄</h2><span>{scoredRows.length}件</span></div>
          {scoredRows.length === 0 ? <p>まだスコア判定銘柄がありません。</p> : (
            <div className="stock-lines">{scoredRows.map((r) => <CompactRow row={r} userId={userId} key={r.id} />)}</div>
          )}
        </section>

        <section className="section compact-section">
          <div className="section-headline"><h2>スコア判定対象外</h2><span>{unscoredRows.length}件</span></div>
          {unscoredRows.length === 0 ? <p>対象外銘柄はありません。</p> : (
            <div className="stock-lines">{unscoredRows.map((r) => <CompactRow row={r} userId={userId} key={r.id} unscored />)}</div>
          )}
        </section>

        <section className="section compact-section footer-links">
          <Link className="btn" href={`/u/${userId}/admin`}>CSV更新ページへ</Link>
        </section>
      </main>
    </>
  );
}
