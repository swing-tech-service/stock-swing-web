// Isolated server-route tests: no production credentials, network or database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps, extras = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const box = { exports: {}, require: name => deps[name], ...extras };
  vm.runInNewContext(code, box); return box.exports;
}
const privacy = load('lib/publicScore.ts', {});
const validation = load('lib/tradeReview.ts', {});
const valid = { code: '4221', buy_date: '2024-06-12', sell_date: '2024-07-12', buy_amount: '10000', sell_amount: '11000' };
test('valid code, same-day trade and decimals', () => {
  const r = validation.validateTrade({ ...valid, code: '130a.T', sell_date: valid.buy_date, buy_amount: '1.25' }, '2026-10-08');
  assert.equal(r.code, '130A'); assert.equal(r.buy_amount, '1.25');
});
for (const change of [{code:'4221;bad'}, {buy_date:'2024-02-30'}, {buy_date:'1999-12-31'}, {sell_date:'2026-10-08'}, {sell_date:'2023-01-01'}, {buy_amount:'0'}, {buy_amount:'NaN'}, {buy_amount:'1e3'}, {buy_amount:'-1'}, {sell_amount:'1.001'}]) {
  test(`reject ${JSON.stringify(change)}`, () => assert.throws(() => validation.validateTrade({...valid,...change}, '2026-10-08')));
}
function route({ user = { id:'takashimasaakiadmin', status:'active', admin_key:'secret' }, dispatch = true, dispatchStatus=403, env={}, history=[] } = {}) {
  const calls = [];
  const db = { from(table) {
    const call = {table, ops:[]}; calls.push(call);
    const q = {};
    for (const method of ['select','eq','order','limit','insert','update','in','lt','single','maybeSingle']) q[method] = (...args) => {call.ops.push([method,...args]); return q;};
    q.then = (resolve, reject) => Promise.resolve({ data: table === 'app_users' ? user : call.ops.some(o => o[0] === 'insert') ? {id:'job-uuid'} : history, error:null }).then(resolve,reject);
    return q;
  }};
  const mod = load('app/api/admin/trade-review/route.ts', {
    'next/server': { NextResponse: {json: (body, opts) => ({body,...opts})} },
    '../../../../lib/supabaseServer': {supabaseAdmin: () => db},
    '../../../../lib/tradeReview': validation,
    '../../../../lib/publicScore': privacy,
  }, {process:{env:{GITHUB_ACTIONS_TOKEN:'test-token',...env}}, Intl, Date, AbortSignal,
    fetch: async (url, opts) => {calls.push({url, payload:JSON.parse(opts.body)}); return {ok:dispatch,status:dispatchStatus};} });
  return {calls, post: body => mod.POST({json: async () => body})};
}
test('missing auth makes no database access', async () => {
  const r = route(); assert.equal((await r.post({action:'list'})).status,401); assert.equal(r.calls.length,0);
});
test('ordinary user key cannot access admin scoring', async () => {
  const r = route(); assert.equal((await r.post({userId:'u001',adminKey:'secret',action:'list'})).status,403); assert.equal(r.calls.length,0);
});
test('wrong key never reads trade history', async () => {
  const r=route(); assert.equal((await r.post({userId:'takashimasaakiadmin',adminKey:'wrong',action:'list'})).status,401); assert.equal(r.calls.length,1);
});
test('inactive admin forbidden', async () => {
  const r=route({user:{status:'inactive',admin_key:'secret'}}); assert.equal((await r.post({userId:'takashimasaakiadmin',adminKey:'secret',action:'list'})).status,403);
});
test('history scoped to authenticated owner and no-store', async () => {
  const r=route(); const result=await r.post({userId:'takashimasaakiadmin',adminKey:'secret',action:'list'});
  assert.equal(result.status,200); assert.equal(result.headers['Cache-Control'],'no-store');
  assert.ok(r.calls[1].ops.some(o => o[0]==='eq' && o[1]==='user_id' && o[2]==='takashimasaakiadmin'));
});
test('dispatch only passes job UUID, never key or amount', async () => {
  const r=route(); const result=await r.post({...valid,userId:'takashimasaakiadmin',adminKey:'secret',action:'create'});
  assert.equal(result.status,202); const sent=r.calls.find(c=>c.url);
  assert.equal(JSON.stringify(sent.payload),JSON.stringify({ref:'main',inputs:{job_id:'job-uuid'}}));
});
test('dispatch rejection reports failure and marks queued job failed', async () => {
  const r=route({dispatch:false}); const result=await r.post({...valid,userId:'takashimasaakiadmin',adminKey:'secret',action:'create'});
  assert.equal(result.status,502); assert.ok(r.calls.at(-1).ops.some(o=>o[0]==='update' && o[1].status==='failed'));
});

for(const status of [401,403,404,422])test('legacy dispatch exposes safe HTTP cause '+status,async()=>{
 const r=route({dispatch:false,dispatchStatus:status});const result=await r.post({...valid,userId:'takashimasaakiadmin',adminKey:'secret',action:'create'});
 assert.equal(result.status,502);assert.ok(result.body.error.includes('HTTP '+status));assert.ok(!result.body.error.includes('test-token'));assert.equal(result.body.id,'job-uuid');
});
test('legacy dedicated ref and whitespace do not change other workflows',async()=>{
 const r=route({env:{GITHUB_ACTIONS_TOKEN:' test-token \n',GITHUB_REF:'other-daily-branch',TRADE_REVIEW_REF:' main \n'}});
 await r.post({...valid,userId:'takashimasaakiadmin',adminKey:'secret',action:'create'});
 assert.equal(r.calls.find(c=>c.url).payload.ref,'main');
});

test('cached legacy history never exposes rules or arbitrary fields',async()=>{
 const secret={score_points:{c01:5},windows:{buy:{rows:[{date:'2024-01-01',offset:0,score:5,close:100,conditions:{c01:true},reason:'SECRET_RULE',unknown:'SECRET_RULE'}]}}};
 const r=route({history:[{id:'job',result:secret}]});
 const result=await r.post({userId:'takashimasaakiadmin',adminKey:'secret',action:'list'});
 assert.equal(result.status,200);assert.ok(!JSON.stringify(result.body).includes('SECRET_RULE'));assert.ok(!JSON.stringify(result.body).includes('score_points'));
 assert.deepEqual(Object.keys(result.body.jobs[0].result.windows.buy.rows[0]),['date','offset','close','score']);
});
