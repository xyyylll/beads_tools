import test from'node:test';import assert from'node:assert/strict';
import{recognizeGrid}from'../server/grid-vision.mjs';
import{validateGrid,gridDifferences,gridCounts,featureDistance,selectPrototypes,classifyCells,sampleCells}from'../public/studio/grid-core.mjs';
import{assembleGrid}from'../public/studio/uploaded-grid.mjs';
import{imageKey,writeGrid,readGrid,exportGridCache,importGridCache,validateGridBackup}from'../public/studio/grid-cache.mjs';
const image='data:image/jpeg;base64,'+'A'.repeat(120);
const grid=()=>({width:40,height:40,cols:2,rows:2,bounds:[0,0,40,40],codes:['H2','H7'],colors:['#ffffff','#000000'],cells:[['H2','H7'],[null,'H2']],unknown:[]});
const model=data=>async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:10,output_tokens:5}}));
test('model layout uses authenticated server key, original image, bounded schema and no storage',async()=>{
 let sent;
 const r=await recognizeGrid({kind:'layout',image,key:'test-only',fetcher:async(url,args)=>{sent=JSON.parse(args.body);return model({cols:52,rows:52,bounds:[.03,.03,.97,.9],uncertain:false})()}});
 assert.equal(r.cols,52);assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.match(sent.instructions,/完整网格/);assert.equal(sent.input[0].content[1].image_url,image);
});
test('invalid geometry is rejected rather than silently drawing a wrong grid',async()=>{
 for(const data of [{cols:0,rows:52,bounds:[0,0,1,1]},{cols:52,rows:52,bounds:[.9,0,.2,1]},{cols:52,rows:52,bounds:[0,0,2,1]}])await assert.rejects(()=>recognizeGrid({kind:'layout',image,key:'x',fetcher:model(data)}));
 assert.throws(()=>validateGrid({...grid(),bounds:[0,0,80,40]},{width:40,height:40}));assert.throws(()=>validateGrid({...grid(),cells:[['H2']] }));
});
test('missing or unreadable tile labels remain explicit unknowns; duplicate tiles are rejected',async()=>{
 const r=await recognizeGrid({kind:'labels',images:[image],codes:['H2'],count:3,key:'x',fetcher:model({labels:[{tile:0,code:'H2',uncertain:false},{tile:1,code:'OTHER',uncertain:false}]})});
 assert.deepEqual(r.labels,[{tile:0,code:'H2',uncertain:false},{tile:1,code:null,uncertain:true},{tile:2,code:null,uncertain:true}]);
 await assert.rejects(()=>recognizeGrid({kind:'labels',images:[image],codes:['H2'],count:2,key:'x',fetcher:model({labels:[{tile:0,code:'H2'},{tile:0,code:'H2'}]})}));
});
test('quota errors stop without retries and never expose the server key',async()=>{
 let calls=0;await assert.rejects(()=>recognizeGrid({kind:'layout',image,key:'private-test-token',fetcher:async()=>{calls++;return new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status:429})}}),e=>e.code==='insufficient_quota'&&!e.message.includes('private-test-token'));assert.equal(calls,1);
});
test('diagnostics compare counts without forcing positional assignments to match usage',()=>{
 const g=grid(),before=JSON.stringify(g);assert.deepEqual(gridCounts(g),{H2:2,H7:1});assert.deepEqual(gridDifferences(g,{H2:1,H7:1,H13:3}),[{code:'H2',actual:2,expected:1},{code:'H13',actual:0,expected:3}]);assert.equal(JSON.stringify(g),before);
});
test('rare labels and identical-background codes are not collapsed by background consensus',()=>{
 const points=[0,1,2,3].map(i=>({bg:[250,250,250],feature:[31.25,31.25,31.25,i%2]}));
 const labels=points.map((_,i)=>({code:i%2?'H19':'H18',uncertain:false}));const r=classifyCells(points,{prototypes:points},labels);assert.deepEqual(r.labels,labels);
 const rare=classifyCells([{bg:[20,20,20],feature:[2,2,2,1]}],{prototypes:[{bg:[20,20,20],feature:[2,2,2,1]}]},[{code:'M11',uncertain:false}]);assert.equal(rare.labels[0].code,'M11');
});
test('an isolated transcription needs two agreeing references and matching glyph features',()=>{
 const p=(bg,shape)=>({bg,feature:[...bg.map(v=>v/8),shape]});const points=[p([150,140,105],1),p([174,154,145],0),p([155,140,110],1),p([155,142,111],1)];
 const labels=[{code:'M8'},{code:'M8'},{code:'M9'},{code:'M9'}],copy=JSON.stringify(labels),r=classifyCells(points,{prototypes:points},labels);
 assert.equal(r.labels[0].code,'M9');assert.equal(r.labels[0].reconciled,true);assert.equal(JSON.stringify(labels),copy);
});
test('assembled map marks unknown positions independently of blank margin and inventory data',()=>{
 const cells=[{row:0,column:0,bg:[255,255,255],feature:[31,31,31,1]},{row:0,column:1,bg:[0,0,0],feature:[0,0,0,1]}];
 const g=assembleGrid({width:40,height:40,cols:2,rows:2,bounds:[0,0,40,40]},cells,{prototypes:cells},[{code:'H2',uncertain:false},{code:null,uncertain:true}],['H2']);
 assert.deepEqual(g.unknown,[[0,1]]);assert.equal(g.cells[1][0],null);assert.equal(g.cells[0][0],'H2');assert.deepEqual(gridCounts(g),{H2:1});
});
test('empty images do not invent a colored pattern or start a labeling task',()=>{
 const pixels={width:40,height:40,data:new Uint8ClampedArray(40*40*4).fill(255)};assert.deepEqual(sampleCells(pixels,{cols:2,rows:2,bounds:[0,0,40,40]}),[]);assert.throws(()=>selectPrototypes([],2));assert.equal(featureDistance([1,2,3,1],[1,2,3,0],3),3);
});
test('same uploaded image reuses a persisted map across renamed/queued records; backups round trip maps',async()=>{
 const key=await imageKey(image),g=grid();await writeGrid(key,g);const stored=await readGrid(key);assert.deepEqual(stored,g);stored.cells[0][0]='H7';assert.equal((await readGrid(key)).cells[0][0],'H2');
 const entries=await exportGridCache([{id:'a',image},{id:'copy',image}]);assert.equal(entries.length,1);assert.equal(entries[0].key,key);
 assert.equal(validateGridBackup(JSON.parse(JSON.stringify(entries))).length,1);await importGridCache(entries,[{image}]);assert.deepEqual(await readGrid(key),g);
 assert.throws(()=>validateGridBackup([{version:1,key:'bad',grid:g}]));assert.throws(()=>validateGridBackup([{version:1,key,grid:{...g,cells:[['<script>']]}}]));
});
test('gray watermark strokes on white margins stay blank while black printed glyphs are retained',()=>{
 const p={width:80,height:40,data:new Uint8ClampedArray(80*40*4).fill(255)};
 for(let y=10;y<30;y++)for(let x=5;x<35;x++){const a=(y*80+x)*4;p.data[a]=p.data[a+1]=p.data[a+2]=180;const b=(y*80+x+40)*4;p.data[b]=p.data[b+1]=p.data[b+2]=10}
 const cells=sampleCells(p,{cols:2,rows:1,bounds:[0,0,80,40]});assert.deepEqual(cells.map(c=>c.column),[1]);
});
