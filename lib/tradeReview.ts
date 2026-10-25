export type ReviewRow = {
  date: string; offset: number; score: number | null; close: number | null;
  status: string; reason: string; conditions: Record<string, boolean>;
  condition_count?: number; score_eligible?: boolean; score_forced?: boolean;
  excluded_gate_reasons?: string[]; missing_dates?: string[];
};
export type ReviewResult = {
  schema_version: number; score_version: string; code: string;
  score_points: Record<string, number>; source: string; calendar: string;
  core_revision: string; calculated_at: string;
  windows: Record<'buy' | 'sell', { requested_date: string; rows: ReviewRow[] }>;
};
export type ReviewJob = {
  id: string; code: string; buy_date: string; sell_date: string;
  buy_amount: string | number; sell_amount: string | number;
  status: string; created_at: string; error_message: string | null;
  result: ReviewResult | null;
};

export function validateTrade(body: Record<string, unknown>, today: string) {
  const code = String(body.code || '').trim().toUpperCase().replace(/\.T$/, '');
  if (!/^\d{3}[\dA-Z]$/.test(code)) throw new Error('銘柄コードは4桁（英字末尾対応）で入力してください');
  const date = (value: unknown) => {
    const s = String(value || '');
    const d = new Date(`${s}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s || s < '2000-01-01' || s >= today)
      throw new Error('日付は2000-01-01以降、昨日までの実在する日を指定してください');
    return s;
  };
  const amount = (value: unknown) => {
    const s = String(value ?? '').trim();
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(s) || Number(s) <= 0)
      throw new Error('金額は0より大きい円額（整数12桁・小数2桁まで）で入力してください');
    return s;
  };
  const buy_date = date(body.buy_date), sell_date = date(body.sell_date);
  if (sell_date < buy_date) throw new Error('売却日は買付日以降にしてください');
  return { code, buy_date, sell_date, buy_amount: amount(body.buy_amount), sell_amount: amount(body.sell_amount) };
}

export const CONDITION_LABELS: Record<string, string> = {
  "c01": "日足終値 > 日足5MA",
  "c02": "日足5MAの傾きが0以上",
  "c03": "日足5MA > 日足25MA",
  "c04": "週足MAの上昇配列",
  "c05": "週足13MAの傾きが0以上",
  "c06": "週足終値が13週MAから+10%以内",
  "c07": "日足200MA割れペナルティ",
  "c08": "週足BB拡大",
  "c09": "日足MACD良好",
  "c10": "週足MACD良好",
  "c11": "日足RSI9条件",
  "c12": "週足RSI14条件",
  "c13": "日足終値が一目雲上限より上",
  "c14": "廃止: 週足終値が一目雲上限より上",
  "c15": "週足13MA上抜け",
  "c16": "日足BB収斂5日以上",
  "c17": "日足BB幅20%以下",
  "c18": "日足BB収斂から拡大",
  "c19": "日足MACDのGCから3日以内",
  "c20": "週足MACDのGCから3週以内",
  "c21": "日足RSI9低位反転継続",
  "c22": "週足RSI14低位反転継続",
  "c23": "週足BB収斂から拡大",
  "c24": "日足MA収斂",
  "c25": "週足MA収斂",
  "c26": "日足一目雲のねじれ＋10営業日高値"
};
