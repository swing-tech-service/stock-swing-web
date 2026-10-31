const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript');
function render({adminKey,session='opaque-signed-session',initialUser='p098',http=200}={}){
 const calls=[],updates=[],states=[true,null,'',false,'10000','11000',false];let index=0;
 const box={exports:{},crypto:{randomUUID:()=> '08b9a607-c80a-4fc4-a35a-9413df5c4d6e'},
  FormData:class{*[Symbol.iterator](){yield* [['code','9432'],['buy_date','2024-06-12'],['sell_date','2024-07-12']];}},
  fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));return{ok:http<400,status:http,json:async()=>http>=400?{error:'reload'}:{status:'queued',remaining:2,global_remaining:99}};},
  require:n=>n==='react'?{useState:()=>{const state=index++;return[states[state],v=>updates.push({state,value:v})];},useRef:v=>({current:v}),useEffect:()=>{}}:
    n==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}:{},
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/u/[userId]/PocAnalysis.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,box);
 const tree=box.exports.default({target:adminKey?'takashimasaakiadmin':'u001',initialUser,adminKey,analysisSession:session});
 function all(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(all);return[node,...all(node.props?.children)];}
 return{tree,nodes:all(tree),calls,updates};
}
test('identity is disabled, read only and gray, with no analysis key input',()=>{
 const {nodes}=render();const identity=nodes.find(n=>n.type==='input'&&n.props.value==='p098');
 assert.equal(identity.props.disabled,true);assert.equal(identity.props.readOnly,true);assert.equal(identity.props['aria-readonly'],'true');assert.equal(identity.props.style.backgroundColor,'#e5e7eb');assert.equal(identity.props.onChange,undefined);
 assert.equal(nodes.filter(n=>n.type==='input'&&n.props.type==='password').length,0);
});
test('submission uses signed authentication, never editable identity, key or amounts',async()=>{
 const {nodes,calls}=render();const form=nodes.find(n=>n.type==='form');await form.props.onSubmit({preventDefault(){},currentTarget:{}});
 assert.equal(calls.length,1);assert.equal(calls[0].session,'opaque-signed-session');
 for(const forbidden of ['user','key','buy_amount','sell_amount'])assert.equal(forbidden in calls[0],false);
 assert.equal(calls[0].action,'create');assert.equal(calls[0].target,'u001');
});
test('result refresh uses the same identity session without any key prompt',async()=>{
 const {nodes,calls}=render();await nodes.find(n=>n.type==='button'&&n.props.children==='残り回数・結果を更新').props.onClick();
 assert.equal(calls[0].action,'status');assert.equal(calls[0].session,'opaque-signed-session');
});
test('existing admin submissions retain the verified admin path',async()=>{
 const {nodes,calls}=render({adminKey:'admin-fixture',initialUser:'takashimasaakiadmin',session:undefined});
 await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});
 assert.equal(calls[0].adminKey,'admin-fixture');assert.equal(calls[0].user,'takashimasaakiadmin');assert.equal('session' in calls[0],false);
});
test('missing session disables execution instead of anonymously falling back',()=>{
 const {nodes}=render({session:''});assert.equal(nodes.find(n=>n.type==='button'&&n.props.children==='分析を実行').props.disabled,true);
});
test('expired or revoked authentication disables further automatic polling',async()=>{
 const {nodes,updates}=render({http:403});
 await nodes.find(n=>n.type==='button'&&n.props.children==='残り回数・結果を更新').props.onClick();
 assert.ok(updates.some(update=>update.state===6&&update.value===true));
});
