const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ts=require('typescript'),{randomUUID}=require('node:crypto');
function setup({env={},rpcResult={data:{remaining:2,status:'queued'}},throws=false,adminStatus='active',mode='admin',dispatchStatus=204}={}) {
 const calls=[];
 const code=ts.transpileModule(fs.readFileSync('app/api/poc-analysis/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const sandbox={exports:{},Buffer,Date,Intl,AbortSignal,fetch:async(url,opts)=>{calls.push({url,payload:JSON.parse(opts.body)});return{ok:dispatchStatus===204,status:dispatchStatus};},process:{env:{POC_ANALYSIS_ENABLED:'true',POC_ANALYSIS_ORIGIN:'https://test.example',...env}},
 require:n=>n==='crypto'?require('node:crypto'):n==='next/server'?{NextResponse:{json:(data,options)=>({data,...options})}}:
 {supabaseAdmin:()=>({from:(table)=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='app_users'?{id:'takashimasaakiadmin',admin_key:'admin-secret',status:adminStatus}:{mode}})})})}),rpc:async(name,args)=>{calls.push({name,args});if(throws)throw Error('secret');return rpcResult;}})}};
 vm.runInNewContext(code,sandbox);
 const post=(body,headers={})=>sandbox.exports.POST(new Request('https://test.example/api/poc-analysis',{
 method:'POST',headers:{'content-type':'application/json',origin:'https://test.example',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
 return {post,calls};
}
const valid=()=>({user:'p001',target:'u001',key:'long-secret-key-12345',action:'create',request_id:randomUUID(),code:'１３０ａ.T',buy_date:'2024-06-12',sell_date:'2024-07-12'});
test('accepted input hashes key, normalizes code, never sends amounts',async()=>{
 const {post,calls}=setup();const r=await post({...valid(),buy_amount:'1234'});
 assert.equal(r.status,202);assert.equal(r.headers['Cache-Control'],'private, no-store');
 assert.equal(calls[0].args.p_code,'130A');assert.equal(calls[0].args.p_hash.length,64);
 assert.ok(!JSON.stringify(calls).includes('long-secret'));assert.ok(!JSON.stringify(calls).includes('1234'));
});
for(const change of [{code:'7203;DROP'}, {buy_date:'2024-02-30'},{sell_date:'2099-01-01'},{sell_date:'2020-01-01'},{request_id:'oops'}, {action:'delete'},{code:7203}])
 test('invalid input rejected '+JSON.stringify(change),async()=>{const {post,calls}=setup();assert.equal((await post({...valid(),...change})).status,400);assert.equal(calls.length,0);});
test('wrong origin blocked before RPC',async()=>{const {post,calls}=setup();assert.equal((await post(valid(),{origin:'https://evil.example'})).status,403);assert.equal(calls.length,0);});
test('feature switch fails closed',async()=>{assert.equal((await setup({env:{POC_ANALYSIS_ENABLED:'false'}}).post(valid())).status,503);});
test('oversized streaming body rejected',async()=>{assert.equal((await setup().post(JSON.stringify({...valid(),extra:'x'.repeat(5000)}))).status,413);});
test('missing and weak credentials rejected',async()=>{assert.equal((await setup().post({...valid(),key:'short'})).status,403);});
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
