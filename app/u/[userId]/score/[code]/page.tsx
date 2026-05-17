import Link from 'next/link';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

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

type ConditionView = {
  no: string;
  title: string;
  star?: boolean;
  ok: boolean;
  criterion: string;
  actual: string;
  ng: string;
};

function fmt(value: any, suffix = '') {
  if (value === null || value === undefined || value === '' || Number.isNaN(value)) return '-';
  return `${value}${suffix}`;
}

function yn(v: any) {
  return v ? '達成' : '未達';
}

function formatJst(value: any) {
  if (!value) return '未実行';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date) + ' JST';
}

const HIDDEN_TAGS = new Set([
  'TRADE READY', 'TRADEREADY', 'ボラOK', 'ボラ不足', 'ボラ判定不可',
  '出来高OK', '出来高強い', '出来高不足', '出来高判定不可',
  '損切り許容内', '損切り遠い', '直近安値接近',
]);

function visibleTags(row: ResultRow) {
  return Array.from(new Set((row.tags || [])
    .map((t) => t === 'BBスクイーズブレイク' ? 'BBブレイク' : t)
    .filter((t) => !HIDDEN_TAGS.has(t))));
}

async function getLatestResult(userId: string, code: string) {
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
  if (!run) return { run: null, row: null as ResultRow | null };

  const result = await supabase
    .from('analysis_results')
    .select('*')
    .eq('run_id', run.id)
    .eq('code', code)
    .single();

  if (result.error) throw new Error(result.error.message);
  return { run, row: result.data as ResultRow };
}

function buildConditions(metrics: Record<string, any> | null): ConditionView[] {
  const m = metrics || {};
  const c = m.conditions || {};
  return [
    {
      no: '①', title: '日足5MA < 株価', ok: !!c.c01,
      criterion: '終値 > 日足5MA',
      actual: `終値 ${fmt(m.close)} / 5MA ${fmt(m.daily_sma5)}`,
      ng: '終値が5MA以下です。短期の上向き確認が弱い状態です。',
    },
    {
      no: '②', title: '日足5MAの傾きが正', ok: !!c.c02,
      criterion: '最新5MA - 前日5MA >= 0',
      actual: `最新5MA ${fmt(m.daily_sma5)} / 前日5MA ${fmt(m.prev_daily_sma5)} / 差 ${fmt(m.daily_sma5_slope)}`,
      ng: '5MAが前日比で下向きです。',
    },
    {
      no: '③', title: '日足5MA > 日足25MA', ok: !!c.c03,
      criterion: '日足5MA > 日足25MA',
      actual: `5MA ${fmt(m.daily_sma5)} / 25MA ${fmt(m.daily_sma25)}`,
      ng: '短期線が25MAを上回っていません。',
    },
    {
      no: '④', star: true, title: '週足13MA > 26MA > 52MA', ok: !!c.c04,
      criterion: '13週MA > 26週MA > 52週MA',
      actual: `13MA ${fmt(m.weekly_sma13)} / 26MA ${fmt(m.weekly_sma26)} / 52MA ${fmt(m.weekly_sma52)}`,
      ng: '週足の移動平均線が上昇順に並んでいません。',
    },
    {
      no: '⑤', star: true, title: '週足13MAの傾きが正', ok: !!c.c05,
      criterion: '最新13週MA - 前週13週MA >= 0',
      actual: `最新13MA ${fmt(m.weekly_sma13)} / 前週13MA ${fmt(m.prev_weekly_sma13)} / 差 ${fmt(m.weekly_sma13_slope)}`,
      ng: '13週MAが前週比で下向きです。',
    },
    {
      no: '⑥', title: '週足13MAからの+乖離率10%以下', ok: !!c.c06,
      criterion: '週足終値 / 13週MA - 1 <= 10%',
      actual: `週足終値 ${fmt(m.weekly_close)} / 13MA ${fmt(m.weekly_sma13)} / 乖離 ${fmt(m.weekly_sma13_gap_pct, '%')}`,
      ng: '13週MAから上に離れすぎています。',
    },
    {
      no: '⑦', title: '日足BBが+1σ以上または-1σ以下', ok: !!c.c07,
      criterion: '終値 >= 日足+1σ または 終値 <= 日足-1σ',
      actual: `終値 ${fmt(m.close)} / +1σ ${fmt(m.daily_bb_upper1)} / -1σ ${fmt(m.daily_bb_lower1)} / 位置 ${fmt(m.daily_bb_position)}`,
      ng: '日足終値が-1σ〜+1σの範囲内です。',
    },
    {
      no: '⑧', star: true, title: '週足BB条件', ok: !!c.c08,
      criterion: '週足終値 <= +2σ かつ、週足BB幅拡大または終値 >= +1σ',
      actual: `週足終値 ${fmt(m.weekly_close)} / 週+1σ ${fmt(m.weekly_bb_upper1)} / 週+2σ ${fmt(m.weekly_bb_upper2)} / BB幅 ${fmt(m.weekly_bb_width)} / 前週BB幅 ${fmt(m.prev_weekly_bb_width)}`,
      ng: '週足のBB位置・拡大条件を満たしていません。',
    },
    {
      no: '⑨', title: '日足MACD条件', ok: !!c.c09,
      criterion: 'MACD > Signal または MACDヒストグラムが前日より改善',
      actual: `MACD ${fmt(m.daily_macd)} / Signal ${fmt(m.daily_macd_signal)} / Hist ${fmt(m.daily_macd_hist)} / 前日Hist ${fmt(m.prev_daily_macd_hist)}`,
      ng: '日足MACDがシグナル以下で、ヒストグラム改善も確認できません。',
    },
    {
      no: '⑩', star: true, title: '週足MACD GC後', ok: !!c.c10,
      criterion: '週足MACD > 週足Signal',
      actual: `週MACD ${fmt(m.weekly_macd)} / 週Signal ${fmt(m.weekly_macd_signal)}`,
      ng: '週足MACDがシグナルを上回っていません。',
    },
    {
      no: '⑪', title: '日足RSI 10以下 or 60以上', ok: !!c.c11,
      criterion: '日足RSI <= 10 または >= 60',
      actual: `日足RSI ${fmt(m.daily_rsi14)}`,
      ng: '日足RSIが10以下でも60以上でもありません。',
    },
    {
      no: '⑫', title: '週足RSI 10以下 or 60以上', ok: !!c.c12,
      criterion: '週足RSI <= 10 または >= 60',
      actual: `週足RSI ${fmt(m.weekly_rsi14)}`,
      ng: '週足RSIが10以下でも60以上でもありません。',
    },
    {
      no: '⑬', title: '日足一目雲より株価が上', ok: !!c.c13,
      criterion: '終値 > 日足雲上限',
      actual: `終値 ${fmt(m.close)} / 日足雲上限 ${fmt(m.daily_ichimoku_cloud_upper)}`,
      ng: '終値が日足雲上限を上回っていません。',
    },
    {
      no: '⑭', star: true, title: '週足一目雲より株価が上', ok: !!c.c14,
      criterion: '週足終値 > 週足雲上限',
      actual: `週足終値 ${fmt(m.weekly_close)} / 週足雲上限 ${fmt(m.weekly_ichimoku_cloud_upper)}`,
      ng: '週足終値が週足雲上限を上回っていません。',
    },
  ];
}


function SidewaysTable({ title, prefix, metrics }: { title: string; prefix: 'daily' | 'weekly'; metrics: Record<string, any> | null | undefined }) {
  const m = metrics || {};
  const ok = !!m[`${prefix}_sideways_ok`];
  const compareLabel = prefix === 'daily' ? '10営業日前BB2σ幅/終値' : '3週前BB2σ幅/終値';
  const maLabel = prefix === 'daily' ? '日足5MA' : '週足13MA';
  const closeLabel = prefix === 'daily' ? '日足終値' : '週足終値';
  return (
    <section className="section">
      <h2>{title}</h2>
      <table>
        <tbody>
          <tr><th>判定</th><td><span className={`badge ${ok ? 'green' : 'gray'}`}>{fmt(m[`${prefix}_sideways_tag`])}</span></td></tr>
          <tr><th>未達理由</th><td>{fmt(m[`${prefix}_sideways_reason`])}</td></tr>
          <tr><th>横ばいレンジ最大値</th><td>{fmt(m[`${prefix}_sideways_range_max`] ?? m[`${prefix}_sideways_range_high`])} / 基準日 {fmt(m[`${prefix}_sideways_range_max_date`] ?? m[`${prefix}_sideways_range_high_date`])}<br />{fmt(m[`${prefix}_sideways_range_high_reason`])}</td></tr>
          <tr><th>横ばいレンジ最小値</th><td>{fmt(m[`${prefix}_sideways_range_min`] ?? m[`${prefix}_sideways_range_low`])} / 基準日 {fmt(m[`${prefix}_sideways_range_min_date`] ?? m[`${prefix}_sideways_range_low_date`])}<br />{fmt(m[`${prefix}_sideways_range_low_reason`])}</td></tr>
          <tr><th>現在値のレンジ内判定</th><td>{m[`${prefix}_sideways_range_in`] ? 'レンジ内' : 'レンジ外'} / 終値 {fmt(m[`${prefix}_sideways_close`])}</td></tr>
          <tr><th>横ばいレンジタグ</th><td>{[m[`${prefix}_sideways_bb_range_tag`], m[`${prefix}_sideways_rsi_range_tag`], m[`${prefix}_sideways_ma_range_tag`]].filter(Boolean).join(' / ') || '-'}</td></tr>
          <tr><th>BB±2σ</th><td>+2σ {fmt(m[`${prefix}_sideways_bb_upper2`])} / -2σ {fmt(m[`${prefix}_sideways_bb_lower2`])}</td></tr>
          <tr><th>BBブレイク</th><td>現在BB2σ幅/終値 {fmt(m[`${prefix}_sideways_bb_width`], '%')} / {compareLabel} {fmt(m[`${prefix}_sideways_bb_width_compare`], '%')}<br />{fmt(m[`${prefix}_sideways_bb_breakout_reason`])}</td></tr>
          <tr><th>RSI</th><td>RSI {fmt(m[`${prefix}_sideways_rsi`])} / RSI傾き {fmt(m[`${prefix}_sideways_rsi_slope`])}</td></tr>
          <tr><th>{maLabel}</th><td>MA {fmt(m[`${prefix}_sideways_ma`])} / MA傾き {fmt(m[`${prefix}_sideways_ma_slope`])}</td></tr>
          <tr><th>{closeLabel}</th><td>{fmt(m[`${prefix}_sideways_close`])} / 株価がMA以下: {m[`${prefix}_sideways_price_below_ma`] ? 'Yes' : 'No'}</td></tr>
          <tr><th>出来高基準</th><td>{fmt(m[`${prefix}_sideways_volume_reference_label`])}平均 {fmt(m[`${prefix}_sideways_volume_avg_reference`] ?? m[`${prefix}_sideways_volume_avg_all`])} / ±3本平均出来高が基準の3倍以上</td></tr>
          <tr><th>最大値側 出来高</th><td>±3本平均 {fmt(m[`${prefix}_sideways_range_high_window_volume_avg`])} / 基準平均 {fmt(m[`${prefix}_sideways_range_high_reference_volume_avg`])} / 倍率 {fmt(m[`${prefix}_sideways_range_high_volume_ratio`])}</td></tr>
          <tr><th>最小値側 出来高</th><td>±3本平均 {fmt(m[`${prefix}_sideways_range_low_window_volume_avg`])} / 基準平均 {fmt(m[`${prefix}_sideways_range_low_reference_volume_avg`])} / 倍率 {fmt(m[`${prefix}_sideways_range_low_volume_ratio`])}</td></tr>
        </tbody>
      </table>
    </section>
  );
}

export default async function ScoreDetail({ params }: { params: Promise<{ userId: string; code: string }> }) {
  const { userId, code } = await params;
  let run: any = null;
  let row: ResultRow | null = null;
  let errorMessage = '';

  try {
    const data = await getLatestResult(userId, code);
    run = data.run;
    row = data.row;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const conditions = buildConditions(row?.metrics || null);

  return (
    <>
      <header className="hero">
        <div className="eyebrow">Score Detail</div>
        <h1>{code} {row?.name || ''}</h1>
        <p className="meta">{userId} / 最終更新: {formatJst(run?.finished_at || run?.started_at)}</p>
      </header>
      <main className="wrap">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <Link className="btn" href={`/u/${userId}`}>ダッシュボードへ戻る</Link>
          {row?.kabutan_url ? <a className="btn" href={row.kabutan_url} target="_blank" rel="noreferrer">株探</a> : null}
        </div>
        {errorMessage ? <div className="alert">エラー: {errorMessage}</div> : null}
        {row ? (
          <>
            <div className="cards">
              <div className="card">スコア<br /><b>{fmt(row.score)}</b></div>
              <div className="card">達成<br /><b>{fmt(row.condition_count)}</b></div>
              <div className="card">未達★<br /><b>{fmt(row.failed_star_numbers)}</b></div>
              <div className="card">現在値<br /><b>{fmt(row.close)}</b></div>
            </div>
            <section className="section">
              <h2>14条件の達成状況</h2>
              <table>
                <thead><tr><th>No</th><th>結果</th><th>条件</th><th>判定基準</th><th>現在値・指標</th><th>未達の場合の見方</th></tr></thead>
                <tbody>
                  {conditions.map((c) => (
                    <tr key={c.no}>
                      <td><b>{c.no}{c.star ? '★' : ''}</b></td>
                      <td><span className={`badge ${c.ok ? 'green' : 'red'}`}>{yn(c.ok)}</span></td>
                      <td>{c.title}</td>
                      <td>{c.criterion}</td>
                      <td>{c.actual}</td>
                      <td>{c.ok ? '-' : c.ng}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <SidewaysTable title="日足横ばい以上" prefix="daily" metrics={row.metrics} />
            <SidewaysTable title="週足横ばい以上" prefix="weekly" metrics={row.metrics} />
            <section className="section">
              <h2>補助テクニカル・タグ理由</h2>
              <table>
                <tbody>
                  <tr><th>タグ</th><td>{visibleTags(row).map((t) => <span className="badge gray" key={t}>{t}</span>)}</td></tr>
                  <tr><th>BB判定</th><td>{fmt(row.metrics?.daily_bb_position)} / {fmt(row.metrics?.daily_bb_width_percentile, '%順位')}</td></tr>
                  <tr><th>BB理由</th><td>{fmt(row.tag_reasons?.bb || row.metrics?.reason)}</td></tr>
                  <tr><th>6か月値幅</th><td>{fmt(row.metrics?.six_month_range_pct, '%')} / 高値 {fmt(row.metrics?.six_month_high)} / 安値 {fmt(row.metrics?.six_month_low)}</td></tr>
                  <tr><th>売買代金</th><td>20日平均 {fmt(row.metrics?.avg_trading_value_20d)}</td></tr>
                  <tr><th>損切り参考</th><td>{fmt(row.metrics?.stop_loss_reference)} / 距離 {fmt(row.metrics?.stop_loss_distance_pct, '%')} / 直近安値日 {fmt(row.metrics?.recent_low_date)}</td></tr>
                  <tr><th>利確20%</th><td>{fmt(row.metrics?.take_profit_20pct)}</td></tr>
                </tbody>
              </table>
            </section>
          </>
        ) : <section className="section">対象銘柄の分析結果がありません。</section>}
      </main>
    </>
  );
}
