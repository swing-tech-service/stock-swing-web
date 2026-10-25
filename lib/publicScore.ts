export type ScoreRow = { date: string; offset: number; close: number | null; score: number | null };
export type ScoreResult = {
  code: string; calculated_at: string;
  windows: Record<'buy' | 'sell', { requested_date: string; rows: ScoreRow[] }>;
};
export function publicScoreResult(raw: unknown): ScoreResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as any;
  const windows = {} as ScoreResult['windows'];
  const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
  for (const side of ['buy', 'sell'] as const) {
    const w = input.windows?.[side];
    windows[side] = {
      requested_date: typeof w?.requested_date === 'string' ? w.requested_date : '',
      rows: (Array.isArray(w?.rows) ? w.rows : []).filter((r: any) =>
        r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
        Number.isInteger(r.offset) && r.offset >= -10 && r.offset <= 5
      ).map((r: any) => ({date:r.date, offset:r.offset, close:number(r.close), score:number(r.score)})),
    };
  }
  return {code:typeof input.code === 'string' ? input.code : '',
    calculated_at:typeof input.calculated_at === 'string' ? input.calculated_at : '', windows};
}
export function scoreCsv(rows: ScoreRow[]) {
  const values: unknown[][] = [['日付','位置','調整後終値','点数'],
    ...rows.map(r => [r.date,r.offset === 0 ? '入力日' : `${r.offset > 0 ? '+' : ''}${r.offset}営業日`,r.close,r.score])];
  return '\uFEFF' + values.map(row=>row.map(v=>`"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
}
