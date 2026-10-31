import { supabaseAdmin } from '../../../lib/supabaseServer';
import { issueAnalysisSession } from '../../../lib/analysisSession';
import PocAnalysis from './PocAnalysis';

// Optional feature: missing SQL, outage, or another dashboard must not break the existing screen.
export default async function PocAnalysisGate({target,initialUser,accessKey}:{target:string;initialUser:string;accessKey:string}) {
  if (!initialUser || !accessKey || target !== 'u001' || process.env.POC_ANALYSIS_ENABLED?.trim() === 'false') return null;
  try {
    const {data,error}=await supabaseAdmin().from('poc_analysis_rollout').select('mode').eq('singleton',true).maybeSingle();
    if(error || data?.mode !== 'u001') return null;
    return <PocAnalysis key={initialUser} target={target} initialUser={initialUser} heading="銘柄分析" analysisSession={issueAnalysisSession(initialUser,target,accessKey)}/>;
  } catch { return null; }
}
