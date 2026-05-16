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

function tagClass(t: string) {
  if (['決算前除外'].includes(t)) return 'red';
  if (['決算直前注意'].includes(t)) return 'orange';
  if (['BBブレイク', 'BB拡大中'].includes(t)) return 'blue';
  if (['小型株'].includes(t)) return 'green';
  if (t.startsWith('決算日:')) return 'orange';
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

const HIDDEN_TAGS = new Set([
  'TRADE READY', 'TRADEREADY',
  'ボラOK', 'ボラ不足', 'ボラ判定不可',
  '出来高OK', '出来高強い', '出来高不足', '出来高判定不可',
  '損切り許容内', '損切り遠い', '直近安値接近',
]);

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

function exclusionReason(row: ResultRow) {
  return row.metrics?.score_exclusion_reason || row.metrics?.score_status || '出来高/ボラ条件未達';
}

function StockCard({ row, userId }: { row: ResultRow; userId: string }) {
  const tags = visibleTags(row);
  return (
    <article className="stock-card">
      <div className="stock-card-head">
        <div>
          <div className="code">{row.code}</div>
          <div className="name">{row.name || ''}</div>
        </div>
        <div className="score-box">
          <span>スコア</span>
          <b>{fmt(row.score)}</b>
        </div>
      </div>
      <div className="mini-grid">
        <div><span>達成</span><b>{fmt(row.condition_count)}</b></div>
        <div><span>未達★</span><b>{fmt(row.failed_star_numbers)}</b></div>
        <div><span>現在値</span><b>{fmt(row.close)}</b></div>
      </div>
      <div className="tag-row">{tags.map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}</div>
      <div className="action-row">
        <Link className="btn" href={`/u/${userId}/score/${row.code}`}>スコア詳細</Link>
        {row.kabutan_url ? <a className="btn" href={row.kabutan_url} target="_blank" rel="noreferrer">株探</a> : null}
      </div>
    </article>
  );
}

function UnscoredCard({ row }: { row: ResultRow }) {
  const tags = visibleTags(row);
  return (
    <article className="stock-card muted-card">
      <div className="stock-card-head">
        <div>
          <div className="code">{row.code}</div>
          <div className="name">{row.name || ''}</div>
        </div>
        <div className="score-box"><span>判定</span><b>-</b></div>
      </div>
      <div className="mini-grid">
        <div><span>現在値</span><b>{fmt(row.close)}</b></div>
        <div><span>6か月値幅</span><b>{fmt(row.metrics?.six_month_range_pct, '%')}</b></div>
        <div><span>20日売買代金</span><b>{fmt(row.metrics?.avg_trading_value_20d)}</b></div>
      </div>
      <p className="reason">対象外理由: {exclusionReason(row)}</p>
      <div className="tag-row">{tags.map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}</div>
    </article>
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
      <header className="hero">
        <div className="eyebrow">Premium Swing Screening</div>
        <h1>{userId} ダッシュボード</h1>
        <p className="meta">最終更新: {lastUpdated} / 毎日16:30 JST頃から更新開始（17:00までに反映目標）</p>
      </header>
      <main className="wrap">
        {errorMessage ? <div className="alert">エラー: {errorMessage}</div> : null}
        <div className="cards">
          <div className="card">監視銘柄<br /><b>{rows.length}</b></div>
          <div className="card">スコア判定<br /><b>{scoredRows.length}</b></div>
          <div className="card">対象外<br /><b>{unscoredRows.length}</b></div>
          <div className="card">BBブレイク<br /><b>{count('BBブレイク') + count('BBスクイーズブレイク')}</b></div>
          <div className="card">決算直前注意<br /><b>{count('決算直前注意')}</b></div>
          <div className="card">決算前除外<br /><b>{count('決算前除外')}</b></div>
        </div>

        <section className="section">
          <h2>スコア判定銘柄</h2>
          <p className="muted">出来高OK以上、かつボラOK以上の銘柄のみスコア判定しています。スコアが高い順に表示します。</p>
          {scoredRows.length === 0 ? <p>まだスコア判定銘柄がありません。</p> : (
            <div className="stock-list">{scoredRows.map((r) => <StockCard row={r} userId={userId} key={r.id} />)}</div>
          )}
        </section>

        <section className="section">
          <h2>スコア判定対象外</h2>
          <p className="muted">出来高またはボラティリティ条件を満たさない銘柄です。簡易一覧として表示します。</p>
          {unscoredRows.length === 0 ? <p>対象外銘柄はありません。</p> : (
            <div className="stock-list">{unscoredRows.map((r) => <UnscoredCard row={r} key={r.id} />)}</div>
          )}
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
