'use client';
import { useState } from 'react';
import type { ReviewJob } from '../../../../lib/tradeReview';
import { publicScoreResult, scoreCsv } from '../../../../lib/publicScore';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function TradeReview({ userId, adminKey }: { userId: string; adminKey: string }) {
  const [form, setForm] = useState({ code: '', buy_date: '', buy_amount: '', sell_date: '', sell_amount: '' });
  const [jobs, setJobs] = useState<ReviewJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function request(action: 'create' | 'list') {
    setBusy(true); setMessage('');
    try {
      const call = async (a: string) => {
        const res = await fetch('/api/admin/trade-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ ...form, userId, adminKey, action: a }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '取得失敗');
        return data;
      };
      if (action === 'create') { const data = await call('create'); setMessage(data.message); }
      const data = await call('list'); setJobs(data.jobs.map((job: ReviewJob)=>({...job,result:publicScoreResult(job.result)})));
    } catch (e) { setJobs([]); setMessage(e instanceof Error ? e.message : 'エラー'); }
    finally { setBusy(false); }
  }
  const labels = { code: '銘柄コード', buy_date: '買付日', buy_amount: '買付金額（円・約定総額）', sell_date: '売却日', sell_amount: '売却金額（円・約定総額）' };
  return <section className="section">
    <h2>管理者向け 売買日のスコア検証</h2>
    <p>各日の終値時点の点数を再計算します。約定時刻の点数ではありません。金額は記録用でスコアには影響しません。</p>
    <p>各入力日の10営業日前から5営業日後までを表示します。非取引日は補正しません。価格欠損・履歴不足は0点にせず判定不可とします。当日・未来日の終値は計算しません。</p>
    <form onSubmit={e => { e.preventDefault(); void request('create'); }}>
      <div className="grid">{(Object.keys(labels) as (keyof typeof labels)[]).map(k => <label key={k}>{labels[k]}<input className="input" required type={k.endsWith('date') ? 'date' : 'text'} inputMode={k.endsWith('amount') ? 'decimal' : undefined} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} /></label>)}</div>
      <button className="btn" disabled={busy || !adminKey}>検証を実行</button>{' '}
      <button className="btn" type="button" disabled={busy || !adminKey} onClick={() => void request('list')}>履歴・実行状況を更新</button>
    </form>
    <p role="status">{busy ? '通信中…' : message}</p>
    <p>履歴は最新10件。実行待ちのまま30分経過した場合は再実行できます。</p>
    {jobs.map(job => <article className="card" key={job.id}>
      <h3>{job.code} / {({ queued: '受付済', running: '計算中', completed: '完了', failed: '失敗' } as Record<string, string>)[job.status] || job.status}</h3>
      <p>買付 {job.buy_date}・{job.buy_amount}円 ／ 売却 {job.sell_date}・{job.sell_amount}円</p>
      <p>受付: {new Date(job.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST</p>
      {job.error_message && <p>{job.error_message}</p>}
      {job.result && <>
        <p>分割・配当調整後株価による再計算です。現行ロジック・取得時点のデータのため、当時表示された点数との一致は保証しません。</p>
        {(['buy', 'sell'] as const).map(side => <div key={side}>
          <h4>{side === 'buy' ? '買付日' : '売却日'}: {job.result!.windows[side].requested_date}（10営業日前〜5営業日後）</h4>
          {job.result!.windows[side].rows.length < 16 && <p>この過去結果は表示範囲が短いため、10営業日前から確認するには再実行してください。</p>}
          <button className="mini-btn" onClick={()=>download(`trade-review-${job.id}-${side}.csv`,scoreCsv(job.result!.windows[side].rows),'text/csv;charset=utf-8')}>CSV出力</button>{' '}
          <button className="mini-btn" onClick={()=>download(`trade-review-${job.id}-${side}.json`,JSON.stringify(job.result!.windows[side].rows,null,2),'application/json')}>結果JSON出力</button>
          <div style={{ overflowX: 'auto' }}><table><thead><tr><th>日付</th><th>位置</th><th>調整後終値</th><th>点数</th></tr></thead><tbody>
            {job.result!.windows[side].rows.map(r => <tr key={r.date} style={r.offset === 0 ? { fontWeight: 'bold', background: 'rgba(128,128,128,.15)' } : undefined}>
              <td>{r.date}</td><td>{r.offset === 0 ? '入力日' : `${r.offset > 0 ? '+' : ''}${r.offset}営業日`}</td><td>{r.close ?? '—'}</td><td>{r.score === null ? '判定不可' : `${r.score}点`}</td>
            </tr>)}
          </tbody></table></div>
        </div>)}
      </>}
    </article>)}
  </section>;
}
