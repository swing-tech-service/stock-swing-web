import { supabaseAdmin } from '../../../lib/supabaseServer';
import PocAnalysis from './PocAnalysis';

// Optional feature: missing SQL, outage, or another dashboard must not break the existing screen.
export default async function PocAnalysisGate({target,initialUser}:{target:string;initialUser:string}) {
  if (target !== 'u001' || process.env.POC_ANALYSIS_ENABLED?.trim() === 'false') return null;
  try {
    const {data,error}=await supabaseAdmin().from('poc_analysis_rollout').select('mode').eq('singleton',true).maybeSingle();
    if(error || data?.mode !== 'u001') return null;
    return <PocAnalysis target={target} initialUser={initialUser}/>;
  } catch { return null; }
}
