import test from 'node:test';import assert from'node:assert/strict';import{parseWords,inferTotal,validateRows}from'../public/studio/ocr-core.mjs';
const word=(text,x,y,w=20,h=12,confidence=95)=>({text,confidence,bbox:{x0:x,y0:y,x1:x+w,y1:y+h}});
test('pairs inline codes/counts without crossing next color',()=>{assert.deepEqual(parseWords([word('H7',0,0),word('77',26,0),word('H2',70,0),word('92',100,0)],['H7','H2']).map(r=>[r.code,r.amount]),[['H7',77],['H2',92]])});
test('pairs counts below swatches by center',()=>{assert.deepEqual(parseWords([word('H7',5,0),word('77',5,30),word('B16',65,0),word('10',65,30)],['H7','B16']).map(r=>[r.code,r.amount]),[['H7',77],['B16',10]])});
test('flags unknown, missing and duplicate colors',()=>{const r=parseWords([word('H7',0,0),word('H7',0,70),word('A99',0,140)],['H7']);assert.ok(r[0].notes.includes('色号重复'));assert.ok(r[2].notes.includes('套装外色号'));assert.ok(r[0].notes.includes('未识别颗数'))});
test('blocks zero, duplicate colors and mismatched totals',()=>{assert.ok(validateRows([{code:'H7',amount:77},{code:'H7',amount:0}],['H7'],100).errors.length>=3);assert.equal(validateRows([{code:'H7',amount:77}],['H7'],77).errors.length,0)});
test('extracts total after table while ignoring dimensions',()=>{assert.equal(inferTotal([word('2120',100,90),word('52',100,115),word('*',130,115),word('52',150,115)],60),2120)});
