const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
for(const userId of ['u001','takashimasaakiadmin'])test('results API hides rules for '+userId,async()=>{
 const box={exports:{},require:name=>name==='next/server'?{NextResponse:{json:(body)=>body}}:{supabaseAdmin:()=>({from:table=>{
 const q={};for(const method of ['select','eq','order','limit'])q[method]=()=>q;
 q.then=resolve=>Promise.resolve({data:table==='analysis_runs'?[{id:'run',status:'success',started_at:'2024-01-01',unknown:'SECRET'}]:[{id:'row',code:'9432',score:5,close:100,metrics:{conditions:{SECRET:true}},score_points:{SECRET:1},tags:['SECRET'],unknown:'SECRET'}]}).then(resolve);return q;
 }})}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/results/[userId]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box);
 const result=await box.exports.GET({}, {params:Promise.resolve({userId})});
 assert.equal(result.rows[0].score,5);assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!JSON.stringify(result).includes('conditions'));
});
