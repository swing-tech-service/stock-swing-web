import Link from 'next/link';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';
export const dynamic = 'force-dynamic';
export default async function ScoreDetail({params}:{params:Promise<{userId:string;code:string}>}) {
  const {userId,code}=await params;
  if(userId!=='takashimasaakiadmin') return <main className="wrap"><section className="section"><p>このページは利用できません。売買日の点数はトップ画面の「分析」で確認してください。</p></section></main>;
  const db=supabaseAdmin();
  const {data:runs}=await db.from('analysis_runs').select('id,finished_at,started_at')
    .eq('user_id',userId).eq('status','success').order('started_at',{ascending:false}).limit(1);
  const run=runs?.[0];
  const {data:row}=run ? await db.from('analysis_results').select('score,close').eq('run_id',run.id).eq('code',code).maybeSingle() : {data:null};
  const date=run?.finished_at || run?.started_at;
  return <main className="wrap"><section className="section"><h1>{code} 点数</h1>
    <Link className="btn" href={`/u/${userId}`}>銘柄整理画面へ戻る</Link>
    {row ? <table><thead><tr><th>日付</th><th>位置</th><th>調整後終値</th><th>点数</th></tr></thead>
      <tbody><tr><td>{date ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date(date)) : '—'}</td>
      <td>最新結果</td><td>{row.close ?? '—'}</td><td>{row.score ?? '判定不可'}</td></tr></tbody></table> : <p>分析結果がありません。</p>}
    <p>日付は最新処理の実行日です。売買日前後の点数は「分析」で確認してください。</p>
  </section></main>;
}
