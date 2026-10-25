'use client';
import { useEffect, useRef, useState } from 'react';

type Row = { date: string; offset: number; score: number | null; close: number | null; reason: string };
export default function PocAnalysis({ target, initialUser = '', adminKey }: { target: string; initialUser?: string; adminKey?: string }) {
  const isAdmin = Boolean(adminKey);
  const [open,setOpen]=useState(false), [user,setUser]=useState(initialUser), [key,setKey]=useState('');
  const [data,setData]=useState<any>(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const [buyAmount,setBuyAmount]=useState(''), [sellAmount,setSellAmount]=useState('');
  const request=useRef<{id:string; fingerprint:string}|null>(null);
  const pending = data?.status === 'queued' || data?.status === 'running';
  const ask = async (payload: Record<string, unknown>) => {
    const response=await fetch('/api/poc-analysis',{ method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user,target,...(isAdmin ? {adminKey} : {key}),...payload}), cache:'no-store' });
    const result=await response.json(); if (!response.ok) throw new Error(result.error || '接続に失敗しました');
    return result;
  };
  const refresh = async () => {
    if (busy) return; setBusy(true); setError('');
    try { setData(await ask({action:'status',request_id:request.current?.id ?? null})); }
    catch(e) { setError((e as Error).message); } finally {setBusy(false);}
  };
  useEffect(() => {
    if (!pending || (!key && !adminKey)) return;
    const id=setTimeout(refresh,15000); return () => clearTimeout(id);
  },[data,key,adminKey,busy]);
  useEffect(() => {
    if (!data?.result || !data.expires_at) return;
    const remaining = new Date(data.expires_at).getTime() - Date.now();
    const id = setTimeout(() => setData((d:any)=>({...d,result:null,status:'expired'})), Math.max(0,remaining));
    return () => clearTimeout(id);
  },[data]);
  const amount=(s:string) => /^\d{1,12}(\.\d{1,2})?$/.test(s) && Number(s)>0;
  const submit=async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if(busy || pending) return;
    if(!amount(buyAmount) || !amount(sellAmount)) {setError('金額は0より大きい円額（整数12桁、小数2桁まで）を入力してください');return;}
    const fields=Object.fromEntries(new FormData(event.currentTarget));
    const input={code:fields.code,buy_date:fields.buy_date,sell_date:fields.sell_date};
    const fingerprint=JSON.stringify([user,target,input]);
    // Network retries reuse the ID. A completed/failed/expired analysis starts a new reservation.
    if (!request.current || request.current.fingerprint!==fingerprint || ['success','failed','expired'].includes(data?.status))
      request.current={id:crypto.randomUUID(),fingerprint};
    setBusy(true);setError('');
    try { const r=await ask({action:'create',request_id:request.current.id,...input});
      if(r.request_id) request.current.id=r.request_id; setData(r);
    } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  };
  return <section className="section">
    <button className="btn" onClick={()=>setOpen(!open)}>分析</button>
    {open && <div>
      <h2>指定銘柄の売買振り返り</h2>
      <p>協力者1人につき日本時間で1日3回。キャッシュの利用・受付後の失敗も1回です。同じ要求の通信再試行は追加消費しません。通常は次の処理時刻から数分かかります。</p>
      <form onSubmit={submit} style={{display:'grid',gap:12,maxWidth:650}}>
        {!isAdmin && <><label>協力者ID<input value={user} onChange={e=>{setUser(e.target.value);setData(null);request.current=null;}} required autoComplete="off" /></label>
        <label>分析用アクセスキー<input type="password" value={key} onChange={e=>setKey(e.target.value)} minLength={16} maxLength={256} required autoComplete="off" /></label></>}
        <label>銘柄コード<input name="code" placeholder="7203 / 130A" required maxLength={12} disabled={pending} /></label>
        <label>買付日<input name="buy_date" type="date" required disabled={pending}/></label>
        <label>売却日<input name="sell_date" type="date" required disabled={pending}/></label>
        <label>買付総額（円）<input inputMode="decimal" value={buyAmount} onChange={e=>setBuyAmount(e.target.value)} required disabled={pending}/></label>
        <label>売却総額（円）<input inputMode="decimal" value={sellAmount} onChange={e=>setSellAmount(e.target.value)} required disabled={pending}/></label>
        <small>金額はこの画面で損益を計算するために使い、サーバーには送信しません。手数料・税金は含みません。</small>
        <button className="btn" disabled={busy||pending}>分析を実行</button>
      </form>
      <button className="mini-btn" onClick={refresh} disabled={busy||(!key&&!adminKey)}>残り回数・結果を更新</button>
      <button className="mini-btn" onClick={()=>{setKey('');setData(null);request.current=null;}}>{isAdmin?'結果を消去':'キー・結果を消去'}</button>
      {error && <p role="alert">{error}</p>}
      {data && <div aria-live="polite"><p>本日の残り: {data.remaining}回 / 権限: {data.role}</p>
        {data.worker_notice && <p role="status">{data.worker_notice}</p>}
        <p>状態: {({queued:'受付済み',running:'分析中',success:'完了',failed:'失敗',expired:'期限切れ'} as any)[data.status] || '待機中'}</p>
        {data.error_message && <p>{data.error_message}</p>}
        {data.expires_at && <p>結果の期限: {new Date(data.expires_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} 日本時間</p>}
        {data.result && <>
          <h3>銘柄 {data.result.code}</h3>
          {amount(buyAmount)&&amount(sellAmount)&&<p>概算損益: {(Number(sellAmount)-Number(buyAmount)).toLocaleString('ja-JP')}円</p>}
          <p>データ: {data.result.source} / 算出: {data.result.calculated_at} / 履歴不足の項目は0点として集計します。</p>
          {(['buy','sell'] as const).map(side=>{
            const rows:Row[]=data.result.windows?.[side]?.rows||[];
            const scores=rows.filter(r=>r.score!==null); const min=Math.min(0,...scores.map(r=>r.score!)), max=Math.max(1,...scores.map(r=>r.score!));
            return <div key={side}><h3>{side==='buy'?'買付':'売却'}日前後の点数</h3>
              <svg viewBox="0 0 600 140" role="img" aria-label="点数推移（欠損は接続しません）" style={{width:'100%',maxWidth:650,background:'#f4f7fc'}}>
                {rows.map((r,i)=>{ const x=20+i*560/Math.max(1,rows.length-1),y=120-100*((r.score??min)-min)/(max-min),p=rows[i-1];
                  return r.score===null?null:<g key={r.date}>{p&&p.score!==null&&<line x1={20+(i-1)*560/Math.max(1,rows.length-1)} y1={120-100*(p.score-min)/(max-min)} x2={x} y2={y} stroke="#245acc"/>}<circle cx={x} cy={y} r={r.offset===0?5:3} fill={r.offset===0?'#c34427':'#245acc'}/></g>;})}
              </svg>
              <div style={{overflowX:'auto'}}><table><thead><tr><th>日付</th><th>営業日差</th><th>点数</th><th>終値</th><th>注記</th></tr></thead><tbody>
                {rows.map(r=><tr key={r.date}><td>{r.date}</td><td>{r.offset===0?'当日':r.offset}</td><td>{r.score??'—'}</td><td>{r.close??'—'}</td><td>{r.reason}</td></tr>)}
              </tbody></table></div></div>;
          })}
          <button className="mini-btn" onClick={()=>{const a=document.createElement('a');const u=URL.createObjectURL(new Blob([JSON.stringify(data.result,null,2)],{type:'application/json'}));a.href=u;a.download='analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}}>結果JSONを保存</button>
        </>}
      </div>}
    </div>}
  </section>;
}
