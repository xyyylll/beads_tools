export const STATUS_LABELS={pending:'待拼',inprogress:'拼中',done:'已拼'};
export function patternStatus(p){return p.status??(p.completed>0?'done':'pending')}
export function validateLifecycle(p){
 const status=patternStatus(p);
 if(!Object.hasOwn(STATUS_LABELS,status)||(status==='done'?p.completed<1:p.completed!==0))throw Error('图纸状态与制作次数不一致');
 if(p.planned!==undefined)checkQuantity(p.planned);
 if(status==='inprogress'&&p.planned===undefined)throw Error('拼中图纸缺少计划数量');
}
function checkQuantity(q){if(!Number.isSafeInteger(q)||q<1||q>999)throw Error('请输入 1–999 的整数')}
export function inventoryFor(state,palette){
 const inv=Object.fromEntries(palette.map(c=>[c.code,['H2','H7'].includes(c.code)?4000:1000]));
 for(const p of state.patterns)for(const[code,n]of Object.entries(p.usage))inv[code]-=n*p.completed;
 for(const a of state.adjustments)inv[a.code]+=a.delta;
 return inv;
}
function find(state,id,status){const p=state.patterns.find(p=>p.id===id);if(!p)throw Error('图纸已不存在');if(status&&patternStatus(p)!==status)throw Error('图纸状态已变化，请重新打开');return p}
function event(state,note,change,time){state.events.push({time,note,change})}
const now=()=>new Date().toISOString();
export function startPattern(state,id,quantity,time=now()){
 const p=find(state,id,'pending');checkQuantity(quantity);
 p.status='inprogress';p.planned=quantity;
 event(state,`开始制作「${p.name}」${quantity} 张`,'库存不变',time);
}
export function returnToPending(state,id,time=now()){
 const p=find(state,id,'inprogress');p.status='pending';delete p.planned;
 event(state,`暂停「${p.name}」，移回待拼`,'库存不变',time);
}
export function completePattern(state,id,palette,time=now()){
 const p=find(state,id,'inprogress'),q=p.planned;checkQuantity(q);
 const inv=inventoryFor(state,palette);
 if(Object.entries(p.usage).some(([code,n])=>n*q>inv[code]))throw Error('豆子库存不足，请补货后再完成');
 p.completed+=q;p.status='done';delete p.planned;
 event(state,`完成「${p.name}」${q} 张`,`−${Object.values(p.usage).reduce((a,b)=>a+b,0)*q} 颗`,time);
}
export function restorePattern(state,id,time=now()){
 const p=find(state,id,'done'),count=p.completed;
 const amount=Object.values(p.usage).reduce((a,b)=>a+b,0)*count;
 p.completed=0;p.status='pending';delete p.planned;
 event(state,`还原「${p.name}」${count} 次制作，图纸移回待拼`,`+${amount} 颗`,time);
}
export function deletePattern(state,id,time=now()){
 const p=find(state,id),consumed=Object.entries(p.usage).map(([code,n])=>({code,delta:-n*p.completed,note:`删除「${p.name}」，保留 ${p.completed} 次制作耗豆`}));
 // Inventory is derived from retained patterns. Transfer the removed pattern's
 // consumption into adjustments so deleting its card can never refund beads.
 state.adjustments.push(...consumed.filter(a=>a.delta!==0));
 state.patterns.splice(state.patterns.indexOf(p),1);
 event(state,`删除「${p.name}」图纸（不还原豆）`,'库存不变，原耗豆保留',time);
}
export function queuedCopy(p,id){return{id,name:p.name+' · 再拼',image:p.image,usage:structuredClone(p.usage),completed:0,status:'pending'}}
