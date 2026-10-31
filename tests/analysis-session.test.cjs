const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript'),crypto=require('node:crypto');
function load(secret='fixture-server-secret'){
 const box={exports:{},Buffer,require:()=>crypto,process:{env:secret?{SUPABASE_SERVICE_ROLE_KEY:secret}:{}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/analysisSession.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);return box.exports;
}
const auth=load(), now=Date.UTC(2026,9,31,3,0,0), key='existing-URL-key',hash=crypto.createHash('sha256').update(key).digest('hex');
test('authenticated identity and current credential round trip',()=>{
 const token=auth.issueAnalysisSession('p098','u001',key,now);const claims=auth.verifyAnalysisSession(token,'u001',now);
 assert.equal(claims.user,'p098');assert.equal(claims.target,'u001');assert.equal(claims.exp-claims.iat,7200);assert.ok(auth.matchesSessionCredential(claims,hash));
 const payload=Buffer.from(token.split('.')[0],'base64url').toString('utf8');
 for(const privateValue of [key,hash,'fixture-server-secret'])assert.ok(!payload.includes(privateValue));
});
test('payload identity and target tampering cannot be signed by the client',()=>{
 const token=auth.issueAnalysisSession('p098','u001',key,now),[p,s]=token.split('.');
 const claims=JSON.parse(Buffer.from(p,'base64url').toString());claims.user='p099';
 assert.equal(auth.verifyAnalysisSession(Buffer.from(JSON.stringify(claims)).toString('base64url')+'.'+s,'u001',now),null);
 assert.equal(auth.verifyAnalysisSession(token,'u002',now),null);
});
test('expires exactly at the expiry second and rejects future issuance',()=>{
 const token=auth.issueAnalysisSession('p098','u001',key,now);
 assert.ok(auth.verifyAnalysisSession(token,'u001',now+7200000-1000));
 assert.equal(auth.verifyAnalysisSession(token,'u001',now+7200000),null);
 assert.equal(auth.verifyAnalysisSession(token,'u001',now-60000),null);
});
test('credential and signing-key rotations invalidate old sessions',()=>{
 const token=auth.issueAnalysisSession('p098','u001',key,now),claims=auth.verifyAnalysisSession(token,'u001',now);
 assert.equal(auth.matchesSessionCredential(claims,'b'.repeat(64)),false);
 assert.equal(load('rotated-server-secret').verifyAnalysisSession(token,'u001',now),null);
});
test('malformed and oversized tokens fail closed',()=>{
 for(const token of [null,{},'','..','a.b','x'.repeat(3000)])assert.equal(auth.verifyAnalysisSession(token,'u001',now),null);
});
test('only the intended dashboard can receive a session, with a server secret',()=>{
 assert.throws(()=>auth.issueAnalysisSession('p098','u002',key,now));
 assert.throws(()=>auth.issueAnalysisSession('','u001',key,now));
 assert.throws(()=>load(null).issueAnalysisSession('p098','u001',key,now));
});
test('already valid shorter dashboard keys do not require new analysis credentials',()=>{
 const token=auth.issueAnalysisSession('p098','u001','short',now);
 assert.ok(auth.verifyAnalysisSession(token,'u001',now));
});
