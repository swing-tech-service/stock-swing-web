const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function gate(mode,fail=false,env={}){
 const code=ts.transpileModule(fs.readFileSync('app/u/[userId]/PocAnalysisGate.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const box={exports:{},process:{env},require:n=>n==='react/jsx-runtime'?{jsx:(type,props)=>({type,props})}:n.endsWith('supabaseServer')?{
   supabaseAdmin:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{if(fail)throw Error('unavailable');return{data:{mode}};}})})})})
 }:{default:'PocAnalysis'}};
 vm.runInNewContext(code,box);return box.exports.default;
}
test('admin stage never shows a public dashboard button',async()=>{
 for(const target of ['u001','u002','takashimasaakiadmin'])assert.equal(await gate('admin')({target,initialUser:'p001'}),null);
});
test('u001 stage exposes only u001',async()=>{
 assert.ok(await gate('u001')({target:'u001',initialUser:'p001'}));
 for(const target of ['u002','takashimasaakiadmin'])assert.equal(await gate('u001')({target,initialUser:'p001'}),null);
});
test('missing DB/outage/off and explicit kill switch hide optional feature',async()=>{
 for(const g of [gate(null),gate('off'),gate('u001',true),gate('u001',false,{POC_ANALYSIS_ENABLED:'false'})])
  assert.equal(await g({target:'u001',initialUser:'p001'}),null);
});
test('existing admin page mounts analysis only under its existing unlocked check',()=>{
 const s=fs.readFileSync('app/u/[userId]/admin/page.tsx','utf8');
 assert.ok(s.includes("unlocked && userId === 'takashimasaakiadmin' ? <AdminAnalysis"));
 assert.ok(s.includes('<TradeReview'));assert.ok(s.includes('runScoreUpdate'));
});
