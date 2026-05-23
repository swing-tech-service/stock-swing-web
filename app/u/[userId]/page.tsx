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
  date?: string;
  close?: number | null;
  diff?: number | null;
  diff_pct?: number | null;
  ma5_gt_ma25?: boolean;
  close_gt_ma25?: boolean;
  rsi14?: number | null;
  macd_gt_signal?: boolean;
  slow_k?: number | null;
  slow_d?: number | null;
  stoch_cross?: string;
  tone?: string;
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

const ADMIN_USER_ID = 'takashimasaakiadmin';

const STATUS_LABEL_PUBLIC: Record<StatusKey, string> = {
  WATCH_PRIORITY: '注目候補',
  BREAKOUT_WATCH: '上放れ候補',
  REVERSAL_WAIT: 'もみ合い圏',
  EARNINGS_CAUTION: 'イベント注意',
  EARNINGS_EXCLUDE: 'イベント前確認',
  OUT_OF_SCOPE: '参考確認',
  WATCH_LIST: '通常確認',
};

const STATUS_LABEL_ADMIN: Record<StatusKey, string> = {
  WATCH_PRIORITY: '監視優先',
  BREAKOUT_WATCH: 'ブレイク監視',
  REVERSAL_WAIT: '反転待ち',
  EARNINGS_CAUTION: '決算注意',
  EARNINGS_EXCLUDE: '決算前除外',
  OUT_OF_SCOPE: 'スコア判定対象外',
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
  if (!run) return { run: null, rows: [] as ResultRow[], marketEnv: undefined as MarketEnv | undefined };

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

function fmtNumber(value: any, digits = 0) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(n);
}

function marketCapText(row: ResultRow) {
  const yen = row.metrics?.market_cap_yen ?? row.metrics?.market_cap;
  if (yen === null || yen === undefined || yen === '') return '';
  const n = Number(yen);
  if (!Number.isFinite(n) || n <= 0) return '';
  const oku = n / 100_000_000;
  if (oku >= 1000) return `${fmtNumber(Math.round(oku), 0)}億`;
  if (oku >= 100) return `${fmtNumber(Math.round(oku), 0)}億`;
  return `${fmtNumber(oku, 1)}億`;
}

function quarterShort(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace('第１四半期', '1Q')
    .replace('第1四半期', '1Q')
    .replace('第２四半期', '2Q')
    .replace('第2四半期', '2Q')
    .replace('第３四半期', '3Q')
    .replace('第3四半期', '3Q')
    .replace('第４四半期', '4Q')
    .replace('第4四半期', '4Q')
    .replace('本決算', '本決算');
}

function earningsInlineText(row: ResultRow) {
  const m = row.metrics || {};
  const prevDate = m.prev_earnings_date;
  const nextDate = m.next_earnings_date || m.earnings_date;
  const prev = prevDate ? `前:${formatMd(prevDate)} ${quarterShort(m.prev_earnings_quarter)}`.trim() : '';
  const next = nextDate ? `次:${formatMd(nextDate)} ${quarterShort(m.next_earnings_quarter || m.earnings_quarter)}`.trim() : '';
  return [prev, next].filter(Boolean).join(' / ');
}

function signed(value: any, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('ja-JP')}${suffix}`;
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

function rangeTag(label: string, kind: string, value: any, date: any) {
  if (value === null || value === undefined || value === '') return '';
  const md = formatMd(date);
  const price = typeof value === 'number'
    ? new Intl.NumberFormat('ja-JP', { maximumFractionDigits: value >= 1000 ? 0 : 1 }).format(value)
    : String(value);
  return md ? `${label}レンジ${kind}:${md} ${price}` : `${label}レンジ${kind}:${price}`;
}

const HIDDEN_TAGS_PUBLIC = new Set([
  'TRADE READY', 'TRADEREADY',
  'ボラOK', 'ボラ不足', 'ボラ判定不可',
  '出来高OK', '出来高強い', '出来高不足', '出来高判定不可',
  '損切り許容内', '損切り遠い', '直近安値接近',
  'BB拡大中',
]);

function isSidewaysRawTag(t: string) {
  return t.includes('レンジ') || t.includes('横ばい');
}

function shouldShowBbBreakout(row: ResultRow) {
  const m = row.metrics || {};
  // 古い分析結果や下方向ブレイクの残存タグを画面で抑止する。
  // 現在値がBB+1σ以上であることをCore側のmetricsで確認できる場合だけ表示する。
  return m.daily_bb_breakout === true && m.daily_bb_breakout_current_positive_touch === true;
}

function displayTag(t: string, isAdmin: boolean) {
  if (isAdmin) return t;
  if (t === 'BBブレイク' || t === 'BBスクイーズブレイク') return '上放れ候補';
  if (t === '決算直前注意') return 'イベント注意';
  if (t === '決算前除外') return 'イベント前確認';
  return t;
}

function tagClass(t: string) {
  if (t.includes('イベント前確認') || t.includes('決算前除外')) return 'red';
  if (t.includes('イベント注意') || t.includes('決算直前注意') || t.startsWith('決算日:')) return 'orange';
  if (t.includes('上放れ候補') || t.includes('BBブレイク')) return 'blue';
  if (t.includes('もみ合い圏')) return 'green';
  if (t.includes('レンジ最大') || t.includes('レンジ最小') || t.includes('横ばい')) return 'purple';
  if (['小型株'].includes(t)) return 'green';
  return 'gray';
}

function visibleTags(row: ResultRow, isAdmin: boolean) {
  let tags = (row.tags || []).filter((t) => t !== 'MARKET_ENV');
  const m = row.metrics || {};
  // BBブレイク/上放れ候補は、現在値がBB+1σ以上のときだけ表示する。
  // 既存DBに古いBBブレイクタグが残っていても、ここで抑止する。
  tags = tags.filter((t) => {
    if (t === 'BBブレイク' || t === 'BBスクイーズブレイク' || t.includes('BB横ばいレンジ')) {
      return shouldShowBbBreakout(row);
    }
    return true;
  });

  if (!isAdmin) {
    tags = tags
      .filter((t) => !HIDDEN_TAGS_PUBLIC.has(t))
      .filter((t) => !isSidewaysRawTag(t));
  }

  if (isAdmin) {
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
  }

  const rawHasEarnings = tags.some((t) => ['決算直前注意', '決算前除外', 'イベント注意', 'イベント前確認'].includes(t));
  const earningsDate = row.metrics?.next_earnings_date || row.metrics?.earnings_date;
  const md = formatMd(earningsDate);
  if (rawHasEarnings && md) tags.push(`決算日:${md}`);

  return Array.from(new Set(tags.map((t) => displayTag(t, isAdmin)).filter(Boolean)));
}

function isScored(row: ResultRow) {
  return typeof row.score === 'number' && Number.isFinite(row.score);
}

function hasAnyTag(row: ResultRow, words: string[], isAdmin: boolean) {
  return visibleTags(row, isAdmin).some((t) => words.some((w) => t.includes(w)));
}

function statusOf(row: ResultRow, isAdmin: boolean): StatusKey {
  const tags = visibleTags(row, isAdmin);
  // ボラ・出来高未達は参考確認リストへ。ただしイベントタグは同じ行に表示する。
  if (!isScored(row)) return 'OUT_OF_SCOPE';
  if (tags.some((t) => t.includes('イベント前確認') || t.includes('決算前除外'))) return 'EARNINGS_EXCLUDE';
  if (tags.some((t) => t.includes('イベント注意') || t.includes('決算直前注意'))) return 'EARNINGS_CAUTION';
  if (Number(row.score) >= 22) return 'WATCH_PRIORITY';
  if (tags.some((t) => t.includes('上放れ候補') || t.includes('BBブレイク'))) return 'BREAKOUT_WATCH';
  if (tags.some((t) => t.includes('もみ合い圏') || t.includes('レンジ内') || t.includes('横ばい'))) return 'REVERSAL_WAIT';
  return 'WATCH_LIST';
}

function reasonsOf(row: ResultRow, isAdmin: boolean) {
  if (!isAdmin) return [];
  const tags = visibleTags(row, true);
  const reasons: string[] = [];
  if (!isScored(row)) reasons.push('出来高またはボラ条件未達のためスコア判定対象外');
  else reasons.push('出来高・ボラティリティ条件をクリア');
  if (Number(row.score) >= 22) reasons.push('独自スコアが上位水準');
  if (tags.some((t) => t.includes('BBブレイク'))) reasons.push('BBブレイク発生中');
  if (tags.some((t) => t.includes('レンジ内') || t.includes('レンジ最小') || t.includes('レンジ最大'))) reasons.push('横ばいレンジ情報を検出');
  if (tags.includes('決算直前注意')) reasons.push('決算直前のため注意');
  if (tags.includes('決算前除外')) reasons.push('決算前除外条件に該当');
  return Array.from(new Set(reasons)).slice(0, 3);
}

function fallbackMarketTone(rows: ResultRow[], isAdmin: boolean) {
  const scored = rows.filter(isScored);
  const high = scored.filter((r) => Number(r.score) >= 22).length;
  const upside = rows.filter((r) => hasAnyTag(r, ['上放れ候補', 'BBブレイク'], isAdmin)).length;
  const risk = rows.filter((r) => visibleTags(r, isAdmin).some((t) => t.includes('イベント前確認') || t.includes('イベント注意') || t.includes('決算'))).length;
  const ratio = scored.length ? high / scored.length : 0;
  const score = ratio * 2 + Math.min(upside, 5) * 0.25 - Math.min(risk, 5) * 0.15;
  if (score >= 1.6) return { label: 'やや強気', stars: '★★★★☆', comment: '確認候補が多く、比較的整理しやすい状況です。' };
  if (score >= 0.9) return { label: '中立', stars: '★★★☆☆', comment: '候補はあります。イベントと株価位置を確認しながら選別します。' };
  if (score >= 0.4) return { label: 'やや慎重', stars: '★★☆☆☆', comment: '確認候補を絞り、イベント前の銘柄に注意します。' };
  return { label: '慎重', stars: '★☆☆☆☆', comment: '無理に対象を広げず、確認候補を絞ります。' };
}

function IndexCard({ item, isAdmin }: { item: MarketIndex; isAdmin: boolean }) {
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
          <div className="index-tone">環境: {item.tone || '-'}</div>
          {isAdmin ? (
            <div className="index-mini">
              <span>5MA&gt;25MA {item.ma5_gt_ma25 ? '○' : '×'}</span>
              <span>終値&gt;25MA {item.close_gt_ma25 ? '○' : '×'}</span>
              <span>RSI {fmt(item.rsi14)}</span>
              <span>MACD {item.macd_gt_signal ? '良好' : '弱め'}</span>
              <span>％K {fmt(item.slow_k)} / ％D {fmt(item.slow_d)}</span>
              <span>{item.stoch_cross || '-'}</span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function StatusPill({ status, isAdmin }: { status: StatusKey; isAdmin: boolean }) {
  const label = isAdmin ? STATUS_LABEL_ADMIN[status] : STATUS_LABEL_PUBLIC[status];
  return <span className={`status-pill status-${status}`}>{label}</span>;
}

function kabutanUrl(row: ResultRow) {
  return `https://kabutan.jp/stock/chart?code=${encodeURIComponent(String(row.code))}`;
}

function StockRow({ row, userId, isAdmin }: { row: ResultRow; userId: string; isAdmin: boolean }) {
  const tags = visibleTags(row, isAdmin);
  const status = statusOf(row, isAdmin);
  const reasons = reasonsOf(row, isAdmin);
  const shownTags = tags.slice(0, isAdmin ? 12 : 5);
  return (
    <article className="premium-stock">
      <div className="stock-topline">
        <StatusPill status={status} isAdmin={isAdmin} />
        <div className="stock-title"><b>{row.code}</b><span>{row.name || ''}</span></div>
        <div className="stock-numbers">
          <span>S<b>{isScored(row) ? fmt(row.score) : '-'}</b></span>
          <span>株価:<b>{fmt(row.close)}</b></span>
          {marketCapText(row) ? <span>時価総額:<b>{marketCapText(row)}</b></span> : null}
          {earningsInlineText(row) ? <span className="earnings-inline">決算:<b>{earningsInlineText(row)}</b></span> : null}
        </div>
      </div>
      <div className="stock-tags">
        {shownTags.map((t) => <span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}
        {tags.length > shownTags.length ? <span className="badge gray">+{tags.length - shownTags.length}</span> : null}
      </div>
      {isAdmin && reasons.length ? <div className="reason-line">理由: {reasons.join(' / ')}</div> : null}
      <div className="stock-actions">
        {isAdmin ? <Link className="mini-btn" href={`/u/${userId}/score/${row.code}`}>詳細</Link> : null}
        <a className="mini-btn kabutan" href={kabutanUrl(row)} target="_blank" rel="noreferrer">株探</a>
      </div>
    </article>
  );
}

function Section({ title, subtitle, rows, userId, isAdmin }: { title: string; subtitle: string; rows: ResultRow[]; userId: string; isAdmin: boolean }) {
  return (
    <section className="section premium-section">
      <div className="section-headline"><div><h2>{title}</h2><p>{subtitle}</p></div><span>{rows.length}件</span></div>
      {rows.length === 0 ? <p className="empty-text">該当銘柄はありません。</p> : <div className="premium-list">{rows.map((r) => <StockRow key={r.id} row={r} userId={userId} isAdmin={isAdmin} />)}</div>}
    </section>
  );
}

export default async function Dashboard({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const isAdmin = userId === ADMIN_USER_ID;
  let data: { run: any; rows: ResultRow[]; marketEnv?: MarketEnv };
  let errorMessage = '';

  try {
    data = await getData(userId);
  } catch (error) {
    data = { run: null, rows: [], marketEnv: undefined };
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const rows = data.rows || [];
  const scoredRows = rows.filter(isScored);
  const byStatus = (s: StatusKey) => rows.filter((r) => statusOf(r, isAdmin) === s);
  const lastUpdated = formatJst(data.run?.finished_at || data.run?.started_at);
  const fallbackTone = fallbackMarketTone(rows, isAdmin);
  const marketEnv = data.marketEnv;
  const tone = marketEnv?.label ? { label: marketEnv.label, stars: marketEnv.stars || fallbackTone.stars, comment: marketEnv.comment || fallbackTone.comment } : fallbackTone;
  const outRows = byStatus('OUT_OF_SCOPE');
  const eventCautionCount = rows.filter((r) => visibleTags(r, isAdmin).some((t) => t.includes('イベント注意') || t.includes('決算直前注意'))).length;
  const eventBeforeCount = rows.filter((r) => visibleTags(r, isAdmin).some((t) => t.includes('イベント前確認') || t.includes('決算前除外'))).length;

  return (
    <>
      <header className="hero premium-hero">
        <div className="eyebrow">Premium Swing Screening {isAdmin ? ' / Admin' : ''}</div>
        <h1>スイング監視ダッシュボード</h1>
        <p className="hero-lead">テクニカルとイベントからあなたの銘柄を整理します。</p>
        <p className="meta">ユーザ: {userId} / 最終更新: {lastUpdated} / 毎日16:30 JST頃から更新開始</p>
      </header>
      <main className="wrap premium-wrap">
        {errorMessage ? <div className="alert">エラー: {errorMessage}</div> : null}

        <section className="market-panel market-panel-v2">
          <div className="market-main">
            <span className="panel-label">市場環境メーター</span>
            <h2>{tone.label} <em>{tone.stars}</em></h2>
            <p>{tone.comment}</p>
            {isAdmin ? <small>{marketEnv?.note || '市況データ未取得時は、監視銘柄全体の分布をもとに暫定判定します。'}</small> : null}
          </div>
          <div className="index-grid">
            {(marketEnv?.indices || []).length ? (marketEnv?.indices || []).map((item) => <IndexCard key={item.key || item.ticker} item={item} isAdmin={isAdmin} />) : (
              <>
                <div className="index-card"><div className="index-head"><b>日経平均</b><span>^N225</span></div><p className="index-error">市況データ未取得</p></div>
                <div className="index-card"><div className="index-head"><b>グロース250参考</b><span>2516.T</span></div><p className="index-error">市況データ未取得</p></div>
              </>
            )}
          </div>
        </section>

        <section className="summary-strip">
          <div><span>{isAdmin ? '監視優先' : '注目候補'}</span><b>{byStatus('WATCH_PRIORITY').length}</b></div>
          <div><span>{isAdmin ? 'ブレイク監視' : '上放れ候補'}</span><b>{byStatus('BREAKOUT_WATCH').length}</b></div>
          <div><span>{isAdmin ? '反転待ち' : 'もみ合い圏'}</span><b>{byStatus('REVERSAL_WAIT').length}</b></div>
          <div><span>イベント注意</span><b>{eventCautionCount}</b></div>
          <div><span>イベント前確認</span><b>{eventBeforeCount}</b></div>
          <div><span>{isAdmin ? 'スコア対象外' : '参考確認'}</span><b>{outRows.length}</b></div>
        </section>

        <Section title={isAdmin ? '監視優先銘柄' : '注目候補'} subtitle="複数の確認材料が重なっている銘柄です。" rows={byStatus('WATCH_PRIORITY')} userId={userId} isAdmin={isAdmin} />
        <Section title={isAdmin ? 'ブレイク監視銘柄' : '上放れ候補'} subtitle="上方向への動き出しを確認したい銘柄です。" rows={byStatus('BREAKOUT_WATCH')} userId={userId} isAdmin={isAdmin} />
        <Section title={isAdmin ? '反転待ち銘柄' : 'もみ合い圏'} subtitle="レンジ内や押し目圏として、チャート位置を確認したい銘柄です。" rows={byStatus('REVERSAL_WAIT')} userId={userId} isAdmin={isAdmin} />
        <Section title="通常確認" subtitle="主要な分類には入っていませんが、継続確認する銘柄です。" rows={byStatus('WATCH_LIST')} userId={userId} isAdmin={isAdmin} />
        <Section title="イベント注意・確認" subtitle="決算などのイベント前後に注意して確認したい銘柄です。" rows={[...byStatus('EARNINGS_CAUTION'), ...byStatus('EARNINGS_EXCLUDE')]} userId={userId} isAdmin={isAdmin} />
        <Section title={isAdmin ? 'スコア判定対象外' : '参考確認リスト'} subtitle="現時点では主要条件がそろっていないため、参考として確認する銘柄です。" rows={outRows} userId={userId} isAdmin={isAdmin} />

        <section className="section guide-section">
          <h2>このアプリの見方</h2>
          <ol>
            <li>まず市場環境メーターを確認する。</li>
            <li>注目候補と上放れ候補を確認する。</li>
            <li>イベント前後の銘柄は慎重に確認する。</li>
            <li>株探でチャートと直近安値を確認する。</li>
            <li>最終判断は自身で行う。</li>
          </ol>
          <p className="disclaimer">本サービスは投資判断を補助する情報提供ツールです。特定銘柄の売買を推奨するものではありません。最終的な投資判断はご自身で行ってください。</p>
          <div className="footer-links"><Link className="btn" href={`/u/${userId}/admin`}>CSV更新ページへ</Link></div>
        </section>
      </main>
    </>
  );
}
