const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const box={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/publicScore.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box);
const {publicScoreResult,scoreCsv}=box.exports;
test('unknown fields, rules, chart indicators are dropped with explicit allowlist',()=>{
 const value=publicScoreResult({secret:'RULE',score_points:{c01:1},windows:{buy:{rows:[{date:'2024-01-01',offset:0,close:100,score:10,conditions:{c01:true},extra:'RULE'}],chart_rows:[{ma5:'RULE'}]}}});
 assert.ok(!JSON.stringify(value).includes('RULE'));assert.equal(Object.keys(value.windows.buy.rows[0]).join(','),'date,offset,close,score');
});
test('sixteen rows preserve -10 through +5 and nullable values',()=>{
 const rows=Array.from({length:16},(_,i)=>({date:'2024-01-01',offset:i-10,close:null,score:i}));
 const result=publicScoreResult({windows:{buy:{rows}}});assert.equal(result.windows.buy.rows.length,16);assert.equal(result.windows.buy.rows[0].offset,-10);assert.equal(result.windows.buy.rows[15].offset,5);
});
test('CSV contains exactly four columns',()=>{
 const csv=scoreCsv([{date:'2024-01-01',offset:0,close:100,score:0,secret:'RULE'}]);assert.equal(csv.split('\r\n')[0],'\uFEFF"日付","位置","調整後終値","点数"');assert.ok(!csv.includes('RULE'));assert.ok(csv.includes('"0"'));
});
test('all analysis tables have only four headers and no rule labels in client source',()=>{
 for(const file of ['app/u/[userId]/PocAnalysis.tsx','app/u/[userId]/admin/TradeReview.tsx','app/u/[userId]/score/[code]/page.tsx']){
 const source=fs.readFileSync(file,'utf8');assert.ok(source.includes('<th>日付</th><th>位置</th><th>調整後終値</th><th>点数</th>'));assert.ok(!source.includes('CONDITION_LABELS'));assert.ok(!source.includes('score_points'));assert.ok(!source.includes('26条件の内訳'));
 }
});
