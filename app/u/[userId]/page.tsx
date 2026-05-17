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



type MarketIndex = {
  key: string;
  label: string;
  ticker: string;
  weight?: number | null;
  date?: string;
  close?: number | null;
  prev_close?: number | null;
  diff?: number | null;
  diff_pct?: number | null;
  ma5?: number | null;
  ma25?: number | null;
  ma5_gt_ma25?: boolean;
  close_gt_ma25?: boolean;
  rsi14?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_gt_signal?: boolean;
  slow_k?: number | null;
  slow_d?: number | null;
  stoch_k_gt_d?: boolean;
  stoch_cross?: string;
  tone?: string;
  reasons?: string[];
  error?: string;
};

type MarketEnv = {
  label?: string;
  stars?: string;
  comment?: string;
  note?: string;
  indices?: MarketIndex[];
};

type StatusKey = 'WATCH_PRIORITY' | 'BREAKOUT_WATCH' | 'REVERSAL_WAIT' | 'EARNINGS_CAUTION' | 'EARNINGS_EXCLUDE' | 'OUT_OF_SCOPE' | 'WATCH_LIST';

const STATUS_LABEL: Record<StatusKey, string> = {
  WATCH_PRIORITY: '監視優先',
  BREAKOUT_WATCH: 'ブレイク監視',
  REVERSAL_WAIT: '反転待ち',
  EARNINGS_CAUTION: '決算注意',
  EARNINGS_EXCLUDE: '決算前除外',
  OUT_OF_SCOPE: '対象外',
  WATCH_LIST: '通常監視',
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

  const allRows = ((results.data ?? []) as ResultRow[]);
  const marketRow = allRows.find((r) => r.code === '__MARKET_ENV__' || (r.tags || []).includes('MARKET_ENV'));
  const marketEnv = marketRow?.metrics?.market_environment as MarketEnv | undefined;
  const rows = allRows
    .filter((r) => r.code !== '__MARKET_ENV__' && !(r.tags || []).includes('MARKET_ENV'))
    .sort((a, b) => {
      const as = typeof a.score === 'number' && Number.isFinite(a.score) ? a.score : null;
      const bs = typeof b.score === 'number' && Number.isFinite(b.score) ? b.score : null;
      if (as === null && bs === null) return String(a.code).localeCompare(String(b.code), 'ja');
      if (as === null) return 1;
      if (bs === null) return -1;
      if (bs !== as) return bs - as;
      return String(a.code).localeCompare(String(b.code), 'ja');
    });

  return { run, rows, marketEnv };
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

function priceText(value: any) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString('ja-JP');
  return String(Math.round(n * 10) / 10);
}

function rangeTag(label: '日足' | '週足', kind: '最大' | '最小', value: any, date: any) {
  if (value === null || value === undefined || value === '') return '';
  const md = formatMd(date);
  const price = priceText(value);
  return md ? `${label}レンジ${kind}:${md} ${price}` : `${label}レンジ${kind}:${price}`;
}

const HIDDEN_TAGS = new Set([
  'TRADE READY', 'TRADEREADY',
  'ボラOK', 'ボラ不足', 'ボラ判定不可',
  '出来高OK', '出来高強い', '出来高不足', '出来高判定不可',
  '損切り許容内', '損切り遠い', '直近安値接近',
  'BB拡大中',
]);

function rawTags(row: ResultRow) {
  const tags = (row.tags || [])
    .map((t) => t === 'BBスクイーズブレイク' ? 'BBブレイク' : t)
    .filter((t) => !HIDDEN_TAGS.has(t));

  const m = row.metrics || {};
  const dailyMax = rangeTag('日足', '最大', m.daily_sideways_range_max ?? m.daily_sideways_range_high, m.daily_sideways_range_max_date ?? m.daily_sideways_range_high_date);
  const dailyMin = rangeTag('日足', '最小', m.daily_sideways_range_min ?? m.daily_sideways_range_low, m.daily_sideways_range_min_date ?? m.daily_sideways_range_low_date);
  const weeklyMax = rangeTag('週足', '最大', m.weekly_sideways_range_max ?? m.weekly_sideways_range_high, m.weekly_sideways_range_max_date ?? m.weekly_sideways_range_high_date);
  const weeklyMin = rangeTag('週足', '最小', m.weekly_sideways_range_min ?? m.weekly_sideways_range_low, m.weekly_sideways_range_min_date ?? m.weekly_sideways_range_low_date);

  for (const t of [dailyMax, dailyMin, weeklyMax, weeklyMin]) if (t) tags.push(t);
  if (m.daily_sideways_range_in === true || m.daily_sideways_range_in_tag) tags.push('日足レンジ内');
  if (m.weekly_sideways_range_in === true || m.weekly_sideways_range_in_tag) tags.push('週足レンジ内');

  for (const t of [
    m.daily_sideways_bb_range_tag,
    m.daily_sideways_rsi_range_tag,
    m.daily_sideways_ma_range_tag,
    m.weekly_sideways_bb_range_tag,
    m.weekly_sideways_rsi_range_tag,
    m.weekly_sideways_ma_range_tag,
  ]) {
    if (t) tags.push(String(t));
  }

  const earningsTag = tags.find((t) => ['決算直前注意', '決算前除外'].includes(t));
  const earningsDate = row.metrics?.next_earnings_date || row.metrics?.earnings_date;
  const md = formatMd(earningsDate);
  if (earningsTag && md) tags.push(`決算日:${md}`);

  return Array.from(new Set(tags));
}

function tagClass(t: string) {
  if (['決算前除外'].includes(t)) return 'red';
  if (['決算直前注意'].includes(t) || t.startsWith('決算日:')) return 'orange';
  if (['BBブレイク'].includes(t) || t.includes('BB横ばいレンジ') || t.includes('レンジ内')) return 'blue';
  if (t.includes('RSI横ばいレンジ')) return 'orange';
  if (t.includes('MA横ばいレンジ') || t.includes('レンジ最大')) return 'purple';
  if (t.includes('レンジ最小') || ['小型株'].includes(t)) return 'green';
  return 'gray';
}

function kabutanUrl(row: ResultRow) {
  return `https://kabutan.jp/stock/chart?code=${encodeURIComponent(String(row.code))}`;
}

function hasAnyTag(row: ResultRow, words: string[]) {
  const tags = rawTags(row);
  return tags.some((t) => words.some((w) => t.includes(w)));
}

function isScored(row: ResultRow) {
  return typeof row.score === 'number' && Number.isFinite(row.score);
}

function statusOf(row: ResultRow): StatusKey {
  const tags = rawTags(row);
  if (tags.includes('決算前除外')) return 'EARNINGS_EXCLUDE';
  if (!isScored(row)) return 'OUT_OF_SCOPE';
  if (tags.includes('決算直前注意')) return 'EARNINGS_CAUTION';
  if (Number(row.score) >= 22 && !tags.includes('決算直前注意')) return 'WATCH_PRIORITY';
  if (tags.some((t) => t.includes('BBブレイク') || t.includes('BB横ばいレンジ') || t.includes('レンジ最大'))) return 'BREAKOUT_WATCH';
  if (tags.some((t) => t.includes('レンジ内') || t.includes('RSI横ばいレンジ') || t.includes('MA横ばいレンジ') || t.includes('レンジ最小'))) return 'REVERSAL_WAIT';
  return 'WATCH_LIST';
}

function reasonsOf(row: ResultRow) {
  const tags = rawTags(row);
  const reasons: string[] = [];
  if (!isScored(row)) {
    reasons.push('出来高またはボラ条件未達のためスコア判定対象外');
  } else {
    reasons.push('出来高・ボラティリティ条件をクリア');
  }
  if (Number(row.score) >= 22) reasons.push('独自スコアが上位水準');
  if (tags.some((t) => t.includes('BBブレイク'))) reasons.push('BBブレイク発生中');
  if (tags.some((t) => t.includes('レンジ内') || t.includes('レンジ最小') || t.includes('レンジ最大'))) reasons.push('横ばいレンジ情報を検出');
  if (tags.some((t) => t.includes('RSI横ばいレンジ'))) reasons.push('RSI低位からの反転候補');
  if (tags.includes('決算直前注意')) reasons.push('決算直前のため注意');
  if (tags.includes('決算前除外')) reasons.push('決算前除外条件に該当');
  if (reasons.length < 2 && isScored(row)) reasons.push('株探でチャート位置と直近安値を確認推奨');
  return Array.from(new Set(reasons)).slice(0, 3);
}

function marketTone(rows: ResultRow[]) {
  const scored = rows.filter(isScored);
  const high = scored.filter((r) => Number(r.score) >= 22).length;
  const bb = rows.filter((r) => hasAnyTag(r, ['BBブレイク'])).length;
  const risk = rows.filter((r) => rawTags(r).some((t) => t.includes('決算前除外') || t.includes('決算直前注意'))).length;
  const ratio = scored.length ? high / scored.length : 0;
  const score = ratio * 2 + Math.min(bb, 5) * 0.25 - Math.min(risk, 5) * 0.15;
  if (score >= 1.6) return { label: 'やや強気', stars: '★★★★☆', comment: 'スコア上位とブレイク候補が多く、監視しやすい環境です。' };
  if (score >= 0.9) return { label: '中立', stars: '★★★☆☆', comment: '候補はありますが、決算・株価位置を確認しながら選別したい環境です。' };
  if (score >= 0.4) return { label: 'やや慎重', stars: '★★☆☆☆', comment: '対象外や決算注意が多めです。無理に広げず監視優先銘柄に絞る局面です。' };
  return { label: '慎重', stars: '★☆☆☆☆', comment: '出来高・ボラ条件を満たす銘柄が少なめです。新規監視は慎重に確認してください。' };
}


function signed(value: any, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('ja-JP')}${suffix}`;
}

function boolLabel(value: any) {
  return value ? '○' : '×';
}

function IndexCard({ item }: { item: MarketIndex }) {
  const diffClass = Number(item.diff || 0) >= 0 ? 'up' : 'down';
  return (
    <div className="index-card">
      <div className="index-head"><b>{item.label}</b><span>{item.ticker}</span></div>
      {item.close === null || item.close === undefined ? (
        <p className="index-error">取得不可: {item.error || '-'}</p>
      ) : (
        <>
          <div className="index-price">{Number(item.close).toLocaleString('ja-JP')}</div>
          <div className={`index-diff ${diffClass}`}>{signed(item.diff)} / {signed(item.diff_pct, '%')}</div>
          <div className="index-date">取得日: {item.date || '-'}</div>
          <div className="index-mini">
            <span>5MA&gt;25MA {boolLabel(item.ma5_gt_ma25)}</span>
            <span>終値&gt;25MA {boolLabel(item.close_gt_ma25)}</span>
            <span>RSI {fmt(item.rsi14)}</span>
            <span>MACD {item.macd_gt_signal ? '良好' : '弱め'}</span>
            <span>％K {fmt(item.slow_k)} / ％D {fmt(item.slow_d)}</span>
            <span>{item.stoch_cross || '-'}</span>
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: StatusKey }) {
  return <span className={`status-pill status-${status}`}>{STATUS_LABEL[status]}</span>;
}

function StockRow({ row, userId, compact = false }: { row: ResultRow; userId: string; compact?: boolean }) {
  const tags = rawTags(row);
  const status = statusOf(row);
  const reasons = reasonsOf(row);
  const shownTags = tags.slice(0, 5);
  return (
    <article className={`premium-stock ${compact ? 'compact' : ''}`}>
      <div className="stock-topline">
        <StatusPill status={status} />
        <div className="stock-title"><b>{row.code}</b><span>{row.name || ''}</span></div>
        <div className="stock-numbers">
          <span>S<b>{isScored(row) ? fmt(row.score) : '-'}</b></span>
          {isScored(row) ? <span>達<b>{fmt(row.condition_count)}</b></span> : null}
          <span>値<b>{fmt(row.close)}</b></span>
        </div>
      </div>
      <div className="stock-tags">
        {shownTags.map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}
        {tags.length > shownTags.length ? <span className="badge gray">+{tags.length - shownTags.length}</span> : null}
      </div>
      <div className="reason-line">理由: {reasons.join(' / ')}</div>
      <div className="stock-actions">
        <Link className="mini-btn" href={`/u/${userId}/score/${row.code}`}>詳細</Link>
        <a className="mini-btn kabutan" href={kabutanUrl(row)} target="_blank" rel="noreferrer">株探</a>
      </div>
    </article>
  );
}

function Section({ title, subtitle, rows, userId }: { title: string; subtitle: string; rows: ResultRow[]; userId: string }) {
  return (
    <section className="section premium-section">
      <div className="section-headline"><div><h2>{title}</h2><p>{subtitle}</p></div><span>{rows.length}件</span></div>
      {rows.length === 0 ? <p className="empty-text">該当銘柄はありません。</p> : <div className="premium-list">{rows.map((r) => <StockRow key={r.id} row={r} userId={userId} />)}</div>}
    </section>
  );
}

export default async function Dashboard({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  let data: { run: any; rows: ResultRow[]; marketEnv?: MarketEnv };
  let errorMessage = '';

  try {
    data = await getData(userId);
  } catch (error) {
    data = { run: null, rows: [], marketEnv: undefined };
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const rows = data.rows || [];
  const lastUpdated = formatJst(data.run?.finished_at || data.run?.started_at);
  const fallbackTone = marketTone(rows);
  const marketEnv = data.marketEnv;
  const tone = marketEnv?.label ? { label: marketEnv.label, stars: marketEnv.stars || fallbackTone.stars, comment: marketEnv.comment || fallbackTone.comment } : fallbackTone;
  const byStatus = (s: StatusKey) => rows.filter((r) => statusOf(r) === s);
  const scoredRows = rows.filter(isScored);
  const outRows = byStatus('OUT_OF_SCOPE');
  const bbCount = rows.filter((r) => hasAnyTag(r, ['BBブレイク'])).length;
  const earningsCaution = byStatus('EARNINGS_CAUTION').length;
  const earningsExclude = byStatus('EARNINGS_EXCLUDE').length;

  return (
    <>
      <header className="hero premium-hero">
        <div className="eyebrow">Premium Swing Screening</div>
        <h1>スイング監視ダッシュボード</h1>
        <p className="hero-lead">出来高・ボラティリティ・決算予定・BBブレイク・レンジ情報をもとに、今日確認すべき銘柄を自動整理します。</p>
        <p className="meta">ユーザ: {userId} / 最終更新: {lastUpdated} / 毎日16:30 JST頃から更新開始</p>
      </header>
      <main className="wrap premium-wrap">
        {errorMessage ? <div className="alert">エラー: {errorMessage}</div> : null}

        <section className="market-panel market-panel-v2">
          <div className="market-main">
            <span className="panel-label">市場環境メーター</span>
            <h2>{tone.label} <em>{tone.stars}</em></h2>
            <p>{tone.comment}</p>
            <small>{marketEnv?.note || '市況データ未取得時は、監視銘柄全体のスコア分布・BBブレイク・決算リスクをもとに暫定判定します。'}</small>
          </div>
          <div className="index-grid">
            {(marketEnv?.indices || []).length ? (marketEnv?.indices || []).map((item) => <IndexCard key={item.key || item.ticker} item={item} />) : (
              <>
                <div className="index-card"><div className="index-head"><b>日経平均</b><span>^N225</span></div><p className="index-error">市況データ未取得</p></div>
                <div className="index-card"><div className="index-head"><b>グロース250参考</b><span>2516.T</span></div><p className="index-error">市況データ未取得</p></div>
              </>
            )}
          </div>
          <div className="market-grid compact-market-grid">
            <div><span>監視銘柄</span><b>{rows.length}</b></div>
            <div><span>スコア判定</span><b>{scoredRows.length}</b></div>
            <div><span>BBブレイク</span><b>{bbCount}</b></div>
            <div><span>決算注意</span><b>{earningsCaution}</b></div>
          </div>
        </section>

        <section className="summary-strip">
          <div><span>監視優先</span><b>{byStatus('WATCH_PRIORITY').length}</b></div>
          <div><span>ブレイク監視</span><b>{byStatus('BREAKOUT_WATCH').length}</b></div>
          <div><span>反転待ち</span><b>{byStatus('REVERSAL_WAIT').length}</b></div>
          <div><span>決算注意</span><b>{earningsCaution}</b></div>
          <div><span>決算前除外</span><b>{earningsExclude}</b></div>
          <div><span>対象外</span><b>{outRows.length}</b></div>
        </section>

        <Section title="監視優先銘柄" subtitle="スコア上位、出来高・ボラ条件を満たし、優先的に確認したい銘柄です。" rows={byStatus('WATCH_PRIORITY')} userId={userId} />
        <Section title="ブレイク監視銘柄" subtitle="BBブレイクやレンジ上限など、動き出しを監視したい銘柄です。" rows={byStatus('BREAKOUT_WATCH')} userId={userId} />
        <Section title="反転待ち銘柄" subtitle="レンジ内、RSI低位、MA下など、押し目・反転を待つ銘柄です。" rows={byStatus('REVERSAL_WAIT')} userId={userId} />
        <Section title="通常監視銘柄" subtitle="条件は一定程度満たしていますが、優先枠には入っていない銘柄です。" rows={byStatus('WATCH_LIST')} userId={userId} />
        <Section title="決算注意・除外銘柄" subtitle="決算直前または決算前除外に該当するため、確認時に注意が必要です。" rows={[...byStatus('EARNINGS_CAUTION'), ...byStatus('EARNINGS_EXCLUDE')]} userId={userId} />
        <Section title="スコア判定対象外" subtitle="出来高またはボラティリティ条件を満たさないため、スコア判定対象外としています。" rows={outRows} userId={userId} />

        <section className="section guide-section">
          <h2>このアプリの見方</h2>
          <ol>
            <li>まず市場環境メーターを確認する。</li>
            <li>監視優先銘柄とブレイク監視銘柄を確認する。</li>
            <li>決算前除外は原則慎重に扱う。</li>
            <li>BBブレイク・レンジ内銘柄を株探で確認する。</li>
            <li>直近安値を損切り候補として確認する。</li>
            <li>最終判断は自身で行う。</li>
          </ol>
          <p className="disclaimer">本サービスは投資判断を補助する情報提供ツールです。特定銘柄の売買を推奨するものではありません。最終的な投資判断はご自身で行ってください。</p>
          <div className="footer-links"><Link className="btn" href={`/u/${userId}/admin`}>CSV更新ページへ</Link></div>
        </section>
      </main>
    </>
  );
}
