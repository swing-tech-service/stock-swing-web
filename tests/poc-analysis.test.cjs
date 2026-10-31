const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ts=require('typescript'),{randomUUID}=require('node:crypto');
const privacyBox={exports:{}}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/publicScore.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,privacyBox);
const crypto=require('node:crypto');
const accessKey='long-secret-key-12345';
const keyHash=crypto.createHash('sha256').update(accessKey).digest('hex');
const authBox={exports:{},Buffer,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-server-secret'}},require:n=>crypto};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/analysisSession.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,authBox);
const auth=authBox.exports;
function setup({env={},rpcResult={data:{remaining:2,status:'queued'}},throws=false,adminStatus='active',mode='admin',dispatchStatus=204,pocRecord={user_code:'p001',target_user_code:'u001',access_key_hash:keyHash,is_active:true,role:'poc'},lookupError=false,quotaPolicyMissing=false}={}) {
 const calls=[];
 const code=ts.transpileModule(fs.readFileSync('app/api/poc-analysis/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const sandbox={exports:{},Buffer,Date,Intl,AbortSignal,fetch:async(url,opts)=>{calls.push({url,payload:JSON.parse(opts.body)});return{ok:dispatchStatus===204,status:dispatchStatus};},process:{env:{POC_ANALYSIS_ENABLED:'true',POC_ANALYSIS_ORIGIN:'https://test.example',...env}},
 require:n=>n==='../../../lib/analysisSession'?auth:n==='../../../lib/publicScore'?privacyBox.exports:n==='crypto'?require('node:crypto'):n==='next/server'?{NextResponse:{json:(data,options)=>({data,...options})}}:
 {supabaseAdmin:()=>({from:(table)=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({error:table==='poc_users'&&lookupError?{}:null,data:table==='app_users'?{id:'takashimasaakiadmin',admin_key:'admin-secret',status:adminStatus}:table==='poc_users'?pocRecord:{mode}})};return q;},rpc:async(name,args)=>{calls.push({name,args});if(throws)throw Error('secret');if(args.p_action==='status'&&args.p_request===null)return{data:{remaining:3,...(quotaPolicyMissing?{}:{global_remaining:100})}};return {...rpcResult,data:rpcResult.data?{global_remaining:98,...rpcResult.data}:rpcResult.data};}})}};
 vm.runInNewContext(code,sandbox);
 const post=(body,headers={})=>sandbox.exports.POST(new Request('https://test.example/api/poc-analysis',{
 method:'POST',headers:{'content-type':'application/json',origin:'https://test.example',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
 return {post,calls};
}
const valid=()=>({user:'p001',target:'u001',session:auth.issueAnalysisSession('p001','u001',accessKey),action:'create',request_id:randomUUID(),code:'１３０ａ.T',buy_date:'2024-06-12',sell_date:'2024-07-12'});
test('verified session supplies credential hash, normalizes code, never sends amounts',async()=>{
 const {post,calls}=setup();const r=await post({...valid(),buy_amount:'1234'});
 assert.equal(r.status,202);assert.equal(r.headers['Cache-Control'],'private, no-store');
 assert.equal(calls.find(c=>c.args?.p_action==='create').args.p_code,'130A');assert.equal(calls[0].args.p_hash.length,64);
 assert.ok(!JSON.stringify(calls).includes('long-secret'));assert.ok(!JSON.stringify(calls).includes('1234'));
});
for(const change of [{code:'7203;DROP'}, {buy_date:'2024-02-30'},{sell_date:'2099-01-01'},{sell_date:'2020-01-01'},{request_id:'oops'}, {action:'delete'},{code:7203}])
 test('invalid input rejected '+JSON.stringify(change),async()=>{const {post,calls}=setup();assert.equal((await post({...valid(),...change})).status,400);assert.equal(calls.length,0);});
test('wrong origin blocked before RPC',async()=>{const {post,calls}=setup();assert.equal((await post(valid(),{origin:'https://evil.example'})).status,403);assert.equal(calls.length,0);});
test('feature switch fails closed',async()=>{assert.equal((await setup({env:{POC_ANALYSIS_ENABLED:'false'}}).post(valid())).status,503);});
test('oversized streaming body rejected',async()=>{assert.equal((await setup().post(JSON.stringify({...valid(),extra:'x'.repeat(5000)}))).status,413);});
test('missing and weak credentials rejected',async()=>{assert.equal((await setup().post({...valid(),session:undefined,key:'short'})).status,403);});
test('invalid JSON returns 400',async()=>{assert.equal((await setup().post('{')).status,400);});
test('database failure fails closed without key or internal error',async()=>{const r=await setup({throws:true}).post(valid());assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('secret'));});
test('database quota rejection preserves 429',async()=>{const r=await setup({rpcResult:{data:{http:429,error:'limit',remaining:0}}}).post(valid());assert.equal(r.status,429);});
test('status does not require trade data',async()=>{const {post,calls}=setup({rpcResult:{data:{remaining:3}}});const r=await post({...valid(),action:'status',request_id:null,code:undefined});assert.equal(r.status,200);assert.equal(calls[0].args.p_code,null);});

test('known administrator authenticated with existing key, not client admin boolean',async()=>{
 const {post,calls}=setup();const b={...valid(),user:'takashimasaakiadmin',target:'takashimasaakiadmin',adminKey:'admin-secret'};
 const r=await post(b);assert.equal(r.status,202);assert.equal(calls[0].args.p_admin,true);
 assert.ok(!JSON.stringify(calls).includes('admin-secret'));
});
test('another ID cannot use the administrator credential path',async()=>{
 const {post,calls}=setup();assert.equal((await post({...valid(),adminKey:'admin-secret'})).status,403);assert.equal(calls.length,0);
});
test('wrong or inactive administrator is rejected before queue',async()=>{
 for(const options of [{},{adminStatus:'inactive'}]){
 const {post,calls}=setup(options);const r=await post({...valid(),user:'takashimasaakiadmin',target:'takashimasaakiadmin',adminKey:options.adminStatus?'admin-secret':'bad'});
 assert.equal(r.status,403);assert.equal(calls.length,0);
 }
});
test('availability hidden until authenticated and enabled in database',async()=>{
 for(const mode of ['admin','u001','off']){
 const {post}=setup({mode});const r=await post({...valid(),user:'takashimasaakiadmin',target:'takashimasaakiadmin',adminKey:'admin-secret',action:'availability'});
 assert.equal(r.status,200);assert.equal(r.data.available,mode!=='off');
 }
});
test('client admin flag cannot bypass collaborator path',async()=>{
 const {post,calls}=setup();await post({...valid(),p_admin:true});assert.equal(calls[0].args.p_admin,false);
});

test('trims deployment flag and origin whitespace',async()=>{
 assert.equal((await setup({env:{POC_ANALYSIS_ENABLED:'false \n'}}).post(valid())).status,503);
 const {post}=setup({env:{POC_ANALYSIS_ORIGIN:' https://test.example/ \n'}});
 assert.equal((await post(valid())).status,202);
});
test('new analysis dispatch uses its own main ref and never sends credentials',async()=>{
 const {post,calls}=setup({env:{GITHUB_ACTIONS_TOKEN:' token \n',GITHUB_REF:'other-daily-branch'},rpcResult:{data:{remaining:2,status:'queued',_wake_worker:true}}});
 const result=await post(valid());assert.equal(result.status,202);
 const sent=calls.find(c=>c.url);assert.deepEqual(JSON.parse(JSON.stringify(sent.payload)),{ref:'main'});
 assert.ok(!('_wake_worker'in result.data));assert.ok(!JSON.stringify(sent.payload).includes('secret'));
});
test('dispatch failure preserves accepted reservation and shows a queue notice',async()=>{
 const {post}=setup({dispatchStatus:403,env:{GITHUB_ACTIONS_TOKEN:'token'},rpcResult:{data:{remaining:2,status:'queued',_wake_worker:true}}});
 const result=await post(valid());assert.equal(result.status,202);assert.equal(result.data.remaining,2);assert.ok(result.data.worker_notice.includes('HTTP 403'));
});
test('cache/retries do not dispatch even with a configured token',async()=>{
 const {post,calls}=setup({env:{GITHUB_ACTIONS_TOKEN:'token'},rpcResult:{data:{remaining:2,status:'queued',_wake_worker:false}}});
 await post(valid());assert.equal(calls.filter(c=>c.url).length,0);
});
test('admin availability provides setup/stop reason without leaking configuration',async()=>{
 const {post}=setup({mode:'off'});const r=await post({...valid(),user:'takashimasaakiadmin',target:'takashimasaakiadmin',adminKey:'admin-secret',action:'availability'});
 assert.equal(r.data.available,false);assert.ok(r.data.reason.includes('停止'));assert.ok(!JSON.stringify(r.data).includes('admin-secret'));
});

test('dedicated analysis token works without changing the shared daily token',async()=>{
 const {post,calls}=setup({env:{POC_ANALYSIS_GITHUB_TOKEN:' feature-only-token '},rpcResult:{data:{remaining:2,status:'queued',_wake_worker:true}}});
 assert.equal((await post(valid())).status,202);assert.equal(calls.filter(c=>c.url).length,1);
});

for(const action of ['create','status'])for(const admin of [false,true])test('no rule details in cached '+action+' admin='+admin,async()=>{
 const rpcResult={data:{remaining:2,status:'success',result:{score_points:{SECRET:10},windows:{buy:{rows:[{date:'2024-01-01',offset:0,score:10,close:100,conditions:{SECRET:true},reason:'SECRET',chart:'SECRET'}],chart_rows:[{SECRET:1}]}}}}};
 const {post}=setup({rpcResult});const b=valid();b.action=action;
 if(admin)Object.assign(b,{user:'takashimasaakiadmin',target:'takashimasaakiadmin',adminKey:'admin-secret'});
 const r=await post(b);assert.equal(r.status,200);assert.ok(!JSON.stringify(r.data).includes('SECRET'));assert.ok(!JSON.stringify(r.data).includes('score_points'));
 assert.deepEqual(Object.keys(r.data.result.windows.buy.rows[0]),['date','offset','close','score']);
});

test('an authenticated session is sufficient without any access key in the request',async()=>{
 const {post,calls}=setup();const input=valid();delete input.user;
 assert.equal((await post(input)).status,202);assert.equal(calls[0].args.p_user,'p001');assert.equal(calls[0].args.p_hash,keyHash);
});
test('client cannot replace the session identity',async()=>{
 const {post,calls}=setup();assert.equal((await post({...valid(),user:'p098'})).status,403);assert.equal(calls.length,0);
});
for(const change of ['tamper','expired','wrong-target','raw-key-only'])test('session is enforced: '+change,async()=>{
 const {post,calls}=setup();const b=valid();
 if(change==='tamper')b.session=b.session.slice(0,-1)+(b.session.endsWith('a')?'b':'a');
 if(change==='expired')b.session=auth.issueAnalysisSession('p001','u001',accessKey,Date.now()-3*60*60*1000);
 if(change==='wrong-target')b.target='u002';
 if(change==='raw-key-only'){delete b.session;b.key=accessKey;}
 assert.equal((await post(b)).status,403);assert.equal(calls.length,0);
});
for(const record of [null,{is_active:false},{access_key_hash:'a'.repeat(64)},{role:'viewer'},{user_code:'p098'},{target_user_code:'u002'}])test('current identity state is rechecked '+JSON.stringify(record),async()=>{
 const base={user_code:'p001',target_user_code:'u001',access_key_hash:keyHash,is_active:true,role:'poc'};
 const {post,calls}=setup({pocRecord:record===null?null:{...base,...record}});
 assert.equal((await post(valid())).status,403);assert.equal(calls.length,0);
});
test('lookup errors fail closed without quota consumption',async()=>{
 const {post,calls}=setup({lookupError:true});assert.equal((await post(valid())).status,503);assert.equal(calls.length,0);
});
test('global quota 429 and remaining counts are preserved without dispatch',async()=>{
 const {post,calls}=setup({rpcResult:{data:{http:429,error:'daily global limit',remaining:3,global_remaining:0}}});
 const r=await post(valid());assert.equal(r.status,429);assert.equal(r.data.global_remaining,0);assert.equal(r.data.remaining,3);assert.equal(calls.filter(c=>c.url).length,0);
});
test('missing quota SQL blocks create before any reservation or dispatch',async()=>{
 const {post,calls}=setup({quotaPolicyMissing:true});const r=await post(valid());
 assert.equal(r.status,503);assert.equal(calls.filter(c=>c.args?.p_action==='create').length,0);assert.equal(calls.filter(c=>c.url).length,0);
});
