async function getData(userId: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/results/${userId}`, { cache: 'no-store' });
  return res.json();
}

function tagClass(t: string) {
  if (['TRADE READY','ボラOK','出来高OK','出来高強い','損切り許容内','小型株'].includes(t)) return 'green';
  if (['決算前除外','出来高不足','ボラ不足','損切り遠い'].includes(t)) return 'red';
  if (['決算直前注意','直近安値接近'].includes(t)) return 'orange';
  if (['BBスクイーズブレイク','BB拡大中'].includes(t)) return 'blue';
  return 'gray';
}

export default async function Dashboard({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const data = await getData(userId);
  const rows = data.rows || [];
  const count = (tag: string) => rows.filter((r: any) => (r.tags || []).includes(tag)).length;
  return <>
    <header className="hero"><div className="eyebrow">Premium Swing Screening</div><h1>{userId} ダッシュボード</h1><p className="meta">最終更新: {data.run?.finished_at || data.run?.started_at || '未実行'} / 毎日17:00 JST更新</p></header>
    <main className="wrap">
      <div className="cards">
        <div className="card">監視銘柄<br/><b>{rows.length}</b></div>
        <div className="card">TRADE READY<br/><b>{count('TRADE READY')}</b></div>
        <div className="card">BBスクイーズ<br/><b>{count('BBスクイーズブレイク')}</b></div>
        <div className="card">ボラOK<br/><b>{count('ボラOK')}</b></div>
        <div className="card">出来高OK<br/><b>{count('出来高OK') + count('出来高強い')}</b></div>
      </div>
      <section className="section"><table><thead><tr><th>コード</th><th>銘柄名</th><th>スコア</th><th>達成</th><th>未達★</th><th>タグ</th><th>現在値</th><th>損切り参考</th><th>損切り距離</th><th>利確20%</th><th>6か月値幅</th><th>株探</th></tr></thead><tbody>
        {rows.map((r:any) => <tr key={r.id}><td><b>{r.code}</b></td><td>{r.name}</td><td>{r.score}</td><td>{r.condition_count}</td><td>{r.failed_star_numbers}</td><td>{(r.tags||[]).map((t:string)=><span className={`badge ${tagClass(t)}`} key={t}>{t}</span>)}</td><td>{r.close}</td><td>{r.metrics?.stop_loss_reference}</td><td>{r.metrics?.stop_loss_distance_pct}%</td><td>{r.metrics?.take_profit_20pct}</td><td>{r.metrics?.six_month_range_pct}%</td><td><a className="btn" href={r.kabutan_url} target="_blank">株探</a></td></tr>)}
      </tbody></table></section>
    </main>
  </>;
}
TS
cat > /mnt/data/stock_swing_mvp/stock-swing-web/app/u/[userId]/admin/page.tsx <<'TSX'
'use client';
import { useState } from 'react';
import Papa from 'papaparse';

export default function Admin({ params }: { params: { userId: string } }) {
  const [adminKey, setAdminKey] = useState('');
  const [message, setMessage] = useState('');
  const [csvText, setCsvText] = useState('code,name\n4012,\n3939,\n4286,');
  async function upload() {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const res = await fetch('/api/watchlist/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: params.userId, adminKey, rows: parsed.data }) });
    const data = await res.json();
    setMessage(res.ok ? `保存しました: ${data.count}件` : `エラー: ${data.error}`);
  }
  return <main className="wrap"><section className="section"><h1>Watchlist管理: {params.userId}</h1><p>CSV形式: code,name,memo</p><div className="grid"><div><label>編集PIN</label><input className="input" value={adminKey} onChange={e=>setAdminKey(e.target.value)} /></div><div><button className="btn" onClick={upload}>保存</button></div></div><textarea rows={16} className="input" value={csvText} onChange={e=>setCsvText(e.target.value)} /><p>{message}</p></section></main>;
}
TS
