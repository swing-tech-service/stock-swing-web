'use client';
import { useEffect,useState } from 'react';
import PocAnalysis from '../PocAnalysis';

export default function AdminAnalysis({userId,adminKey}:{userId:string;adminKey:string}) {
  const [visible,setVisible]=useState(false);
  const [problem,setProblem]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setVisible(false);
    setProblem('');
    if(userId==='takashimasaakiadmin' && adminKey) {
      fetch('/api/poc-analysis',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'availability',target:userId,user:userId,adminKey}),signal:controller.signal,cache:'no-store'})
        .then(async r=>{const b=await r.json();if(!controller.signal.aborted){setVisible(r.ok&&b.available===true);if(!r.ok||!b.available)setProblem(b.error||b.reason||'分析の設定を確認できません。追加SQLと公開モードを確認してください。');}})
        .catch(()=>{if(!controller.signal.aborted)setProblem('分析サービスの確認に失敗しました。ページを再読み込みしてください。');});
    }
    return ()=>controller.abort();
  },[userId,adminKey]);
  if(userId!=='takashimasaakiadmin') return null;
  return visible?<div><h2>銘柄分析（新しい分析ツール）</h2><p>下の「分析」を開いて実行してください。u001に公開した後も同じ分析処理を使います。</p><PocAnalysis target={userId} initialUser={userId} adminKey={adminKey}/></div>:problem?<section className="section"><h2>銘柄分析</h2><p role="alert">{problem}</p></section>:null;
}
