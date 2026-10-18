import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patternStatus,validateLifecycle,inventoryFor,startPattern,returnToPending,completePattern,restorePattern,deletePattern,queuedCopy} from '../public/studio/pattern-lifecycle.mjs';
const root=new URL('../public/studio/',import.meta.url);
const palette=JSON.parse(fs.readFileSync(new URL('palette.json',root)));
const seed=JSON.parse(fs.readFileSync(new URL('seed.json',root)));
const fresh=()=>({version:1,patterns:structuredClone(seed),adjustments:[],events:[]});
const inv=s=>inventoryFor(s,palette),sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
const addPending=s=>{const p=queuedCopy(seed[5],'new');s.patterns.push(p);return p};
test('legacy completed records remain done; old zero-completion records remain pending',()=>{
 for(const p of seed){assert.equal(patternStatus(p),'done');validateLifecycle(p)}
 const p={...seed[5],completed:0};assert.equal(patternStatus(p),'pending');validateLifecycle(p);
 for(const status of ['done','other','inprogress'])assert.throws(()=>validateLifecycle({...p,status}));
 assert.throws(()=>validateLifecycle({...p,status:'inprogress',planned:0}));
});
test('pending → in progress → done consumes exactly the planned quantity once',()=>{
 const s=fresh(),p=addPending(s),before=inv(s);startPattern(s,p.id,2);
 assert.equal(patternStatus(p),'inprogress');assert.equal(p.planned,2);assert.deepEqual(inv(s),before);
 completePattern(s,p.id,palette);assert.equal(patternStatus(p),'done');assert.equal(p.completed,2);
 const after=inv(s);for(const[c,n]of Object.entries(p.usage))assert.equal(after[c],before[c]-n*2);
 const snapshot=JSON.stringify(s);assert.throws(()=>completePattern(s,p.id,palette));assert.equal(JSON.stringify(s),snapshot);
});
test('insufficient stock blocks completion without partially changing state; pause refunds nothing',()=>{
 const s=fresh(),p=addPending(s);startPattern(s,p.id,999);const before=JSON.stringify(s);
 assert.throws(()=>completePattern(s,p.id,palette),/不足/);assert.equal(JSON.stringify(s),before);
 const original=inv(s);returnToPending(s,p.id);assert.equal(patternStatus(p),'pending');assert.deepEqual(inv(s),original);
 for(const q of [0,-1,1.5,1000,NaN])assert.throws(()=>startPattern(s,p.id,q));
});
test('deleting completed charts preserves every color balance and consumption after backup round trip',()=>{
 const s=fresh();s.patterns[5].completed=3;s.adjustments.push({code:'H2',delta:250,note:'补货'});
 const before=inv(s),p=s.patterns[5];deletePattern(s,p.id);
 assert.equal(s.patterns.some(x=>x.id===p.id),false);assert.deepEqual(inv(s),before);
 const expected=Object.fromEntries(Object.entries(p.usage).map(([c,n])=>[c,-n*3]));
 assert.deepEqual(Object.fromEntries(s.adjustments.slice(1).map(a=>[a.code,a.delta])),expected);
 const backup=JSON.parse(JSON.stringify(s));assert.deepEqual(inv(backup),before);
 assert.match(backup.events.at(-1).note,/不还原豆/);assert.throws(()=>deletePattern(s,p.id));
});
test('restoring a completed chart returns its full usage, retains the card and cannot refund twice',()=>{
 const s=fresh(),p=s.patterns[5];p.completed=2;s.adjustments.push({code:'H2',delta:-13,note:'盘点'});
 const before=inv(s);restorePattern(s,p.id);assert.equal(patternStatus(p),'pending');assert.equal(p.completed,0);
 assert.equal(s.patterns.length,6);const after=inv(s);
 for(const[c,n]of Object.entries(p.usage))assert.equal(after[c],before[c]+n*2);
 const snapshot=JSON.stringify(s);assert.throws(()=>restorePattern(s,p.id));assert.equal(JSON.stringify(s),snapshot);
 assert.deepEqual(inv(JSON.parse(snapshot)),after);
});
test('restore then complete then delete maintains conservation across repeated lifecycle changes',()=>{
 const s=fresh(),before=inv(s),p=s.patterns[5];restorePattern(s,p.id);startPattern(s,p.id,1);completePattern(s,p.id,palette);
 assert.deepEqual(inv(s),before);deletePattern(s,p.id);assert.deepEqual(inv(s),before);
 assert.equal(sum(inv(s)),216310);
});
test('deleting pending/in-progress cards does not alter any inventory or manufacture refund adjustments',()=>{
 for(const active of [false,true]){
  const s=fresh(),p=addPending(s);if(active)startPattern(s,p.id,2);const before=inv(s);
  deletePattern(s,p.id);assert.deepEqual(inv(s),before);assert.equal(s.adjustments.length,0);
 }
});
test('re-pinning completed charts creates an independent pending copy with no inherited plan',()=>{
 const old={...seed[5],planned:8,status:'done'},p=queuedCopy(old,'copy');
 assert.equal(p.completed,0);assert.equal(patternStatus(p),'pending');assert.equal(p.planned,undefined);
 p.usage.H2=1;assert.equal(old.usage.H2,92);assert.equal(p.image,old.image);validateLifecycle(p);
});
