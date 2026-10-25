import type { ScoreResult } from './publicScore';
export type ReviewJob = {
  id: string; code: string; buy_date: string; sell_date: string;
  buy_amount: string | number; sell_amount: string | number;
  status: string; created_at: string; error_message: string | null;
  result: ScoreResult | null;
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
