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
  tag_reasons: Record<string, any> | null;
  kabutan_url: string | null;
};

function formatJst(value: string | null | undefined) {
  if (!value) return '未実行';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '未実行';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatMd(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: '2-digit',
  }).format(d);
}

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
    .eq('run_id', run.id)
    .order('score', { ascending: true, nullsFirst: false })
    .order('condition_count', { ascending: true, nullsFirst: false });

  if (results.error) throw new Error(results.error.message);
  return { run, rows: (results.data ?? []) as ResultRow[] };
}

function tagClass(t: string) {
  if (['BBブレイク', 'BB拡大中'].includes(t)) return 'blue';
  if (['決算前除外'].includes(t)) return 'red';
  if (['決算直前注意'].includes(t)) return 'orange';
  if (['小型株'].includes(t)) return 'green';
  return 'gray';
}

function fmt(value: any, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${suffix}`;
}

function isScoreCalculated(r: ResultRow) {
  if (r.metrics?.score_calculated === false) return false;
  if (r.score === null || r.score === undefined) return false;
  return true;
}

function normalizeTag(t: string) {
  if (t === 'BBスクイーズブレイク') return 'BBブレイク';
  return t;
}

function visibleTags(r: ResultRow) {
  const raw = (r.tags || []).map(normalizeTag);
  const allowed = new Set(['決算直前注意', '決算前除外', 'BBブレイク', 'BB拡大中', '小型株']);
  const out = raw.filter((t) => allowed.has(t));
  return Array.from(new Set(out));
}

function earningsDateTag(r: ResultRow) {
  const tags = (r.tags || []).map(normalizeTag);
  const hasEarningsWarning = tags.includes('決算直前注意') || tags.includes('決算前除外');
  if (!hasEarningsWarning) return '';
  return formatMd(r.metrics?.next_earnings_date);
}

function sortedScoredRows(rows: ResultRow[]) {
  return rows
    .filter(isScoreCalculated)
    .slice()
    .sort((a, b) => {
      const scoreDiff = Number(b.score ?? -9999) - Number(a.score ?? -9999);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.condition_count ?? -9999) - Number(a.condition_count ?? -9999);
    });
}

function sortedNotScoredRows(rows: ResultRow[]) {
  return rows
    .filter((r) => !isScoreCalculated(r))
    .slice()
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'ja'));
}

function kabutanUrl(r: ResultRow) {
  return `https://kabutan.jp/stock/chart?code=${r.code}`;
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
  const scoredRows = sortedScoredRows(rows);
  const notScoredRows = sortedNotScoredRows(rows);
  const count = (tag: string) => rows.filter((r) => visibleTags(r).includes(tag)).length;
  const earningsCount = rows.filter((r) => visibleTags(r).includes('決算直前注意') || visibleTags(r).includes('決算前除外')).length;

  return (
    <>
      <header className="hero">
        <div className="eyebrow">Premium Swing Screening</div>
        <h1>{userId} ダッシュボード</h1>
        <p className="meta">最終更新: {formatJst(data.run?.finished_at || data.run?.started_at)} / 毎営業日17時頃更新</p>
      </header>
      <main className="wrap">
        {errorMessage ? <div className="alert">エラー: {errorMessage}</div> : null}
        <div className="cards">
          <div className="card">登録銘柄<br /><b>{rows.length}</b></div>
          <div className="card">スコア判定対象<br /><b>{scoredRows.length}</b></div>
          <div className="card">判定対象外<br /><b>{notScoredRows.length}</b></div>
          <div className="card">BBブレイク<br /><b>{count('BBブレイク')}</b></div>
          <div className="card">決算注意/除外<br /><b>{earningsCount}</b></div>
        </div>

        <section className="section">
          <h2>スコア判定銘柄</h2>
          <p>出来高条件とボラ条件を満たした銘柄のみスコア判定を行います。</p>
          <table>
            <thead>
              <tr>
                <th>コード</th><th>銘柄名</th><th>スコア</th><th>達成</th><th>未達★</th><th>タグ</th><th>現在値</th><th>株探</th>
              </tr>
            </thead>
            <tbody>
              {scoredRows.length === 0 ? (
                <tr><td colSpan={8}>スコア判定対象の銘柄がありません。</td></tr>
              ) : scoredRows.map((r) => {
                const dateTag = earningsDateTag(r);
                return (
                  <tr key={r.id}>
                    <td><b>{r.code}</b></td>
                    <td>{r.name || ''}</td>
                    <td>{fmt(r.score)}</td>
                    <td>{fmt(r.condition_count)}</td>
                    <td>{fmt(r.failed_star_numbers)}</td>
                    <td>
                      {visibleTags(r).map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}
                      {dateTag ? <span className="badge orange">決算日: {dateTag}</span> : null}
                    </td>
                    <td>{fmt(r.close)}</td>
                    <td><a className="btn" href={kabutanUrl(r)} target="_blank" rel="noreferrer">株探</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="section">
          <h2>スコア判定を行っていない銘柄</h2>
          <p>出来高またはボラ条件を満たさないため、14条件スコア判定の対象外です。</p>
          <table>
            <thead>
              <tr>
                <th>コード</th><th>銘柄名</th><th>対象外理由</th><th>タグ</th><th>現在値</th><th>株探</th>
              </tr>
            </thead>
            <tbody>
              {notScoredRows.length === 0 ? (
                <tr><td colSpan={6}>対象外銘柄はありません。</td></tr>
              ) : notScoredRows.map((r) => {
                const dateTag = earningsDateTag(r);
                return (
                  <tr key={r.id}>
                    <td><b>{r.code}</b></td>
                    <td>{r.name || ''}</td>
                    <td>{fmt(r.metrics?.score_skip_reasons?.join?.(' / ') || r.tag_reasons?.score_skip)}</td>
                    <td>
                      {visibleTags(r).map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}
                      {dateTag ? <span className="badge orange">決算日: {dateTag}</span> : null}
                    </td>
                    <td>{fmt(r.close)}</td>
                    <td><a className="btn" href={kabutanUrl(r)} target="_blank" rel="noreferrer">株探</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="section">
          <h2>CSV登録・更新</h2>
          <p>監視銘柄CSVを変更する場合は、管理画面から登録してください。登録後、管理画面の「スコア判定を更新」ボタンで分析を実行できます。</p>
          <a className="btn" href={`/u/${userId}/admin`}>CSV登録・更新ページへ</a>
        </section>
      </main>
    </>
  );
}
