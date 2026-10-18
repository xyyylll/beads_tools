import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {cellAtPoint,colorPositions,supportsGuide} from '../public/studio/bead-guide.mjs';
const assets=new URL('../public/studio/',import.meta.url);
const grids=JSON.parse(fs.readFileSync(new URL('grids.json',assets)));
const seed=JSON.parse(fs.readFileSync(new URL('seed.json',assets)));
for (const [i,grid] of grids.entries()) {
 test(`${seed[i].name}: all position counts match the independent usage table and original image`,()=>{
  assert.equal(grid.cells.length,grid.rows);
  assert.ok(grid.cells.every(row=>row.length===grid.cols));
  const counts={};
  for(const row of grid.cells)for(const code of row)if(code)counts[code]=(counts[code]||0)+1;
  assert.deepEqual(counts,seed[i].usage);
  assert.equal(new Set(grid.codes).size,grid.codes.length);
  assert.deepEqual([...grid.codes].sort(),Object.keys(counts).sort());
  assert.equal(grid.colors.length,grid.codes.length);
  assert.ok(grid.colors.every(c=>/^#[a-f0-9]{6}$/.test(c)));
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(grid.image,assets))).digest('hex'),grid.sha256);
 });
 test(`${seed[i].name}: every cell center maps back to the correct row, column and code`,()=>{
  const [left,top,right,bottom]=grid.bounds;
  for(let r=0;r<grid.rows;r++)for(let c=0;c<grid.cols;c++) {
   assert.deepEqual(cellAtPoint(grid,left+(c+.5)*(right-left)/grid.cols,top+(r+.5)*(bottom-top)/grid.rows),{row:r,column:c,code:grid.cells[r][c]});
  }
  for(const [x,y] of [[left-1,top],[left,top-1],[right,top],[left,bottom]])assert.equal(cellAtPoint(grid,x,y),null);
 });
}
test('single-color selection includes only that color, keeps all occurrences, and leaves map unchanged',()=>{
 const before=JSON.stringify(grids);
 for(const grid of grids) {
  const all=colorPositions(grid);
  const selected=grid.codes.flatMap(code=>{
   const cells=colorPositions(grid,code);
   assert.ok(cells.every(cell=>cell.code===code&&grid.cells[cell.row][cell.column]===code));
   return cells;
  });
  assert.equal(selected.length,all.length);
  assert.equal(new Set(selected.map(c=>`${c.row},${c.column}`)).size,all.length);
 }
 assert.equal(JSON.stringify(grids),before);
});
test('black/white cells, similar colors, rare color and empty margin use literal chart positions',()=>{
 assert.equal(grids[5].cells[2][6],'H7');
 assert.equal(grids[5].cells[3][15],'H2');
 assert.equal(grids[5].cells[4][7],'M15');
 assert.equal(grids[5].cells[0][0],null);
 assert.equal(grids[0].cells[45][20],'F10');
 assert.equal(grids[2].cells[3][20],'H18');
 assert.equal(grids[2].cells[3][36],'H19');
 assert.equal(grids[4].cells[45][51],null);
});
test('bundled images and newly uploaded image records expose the focus entry',()=>{
 for(const p of seed)assert.equal(supportsGuide({...p,id:'copy',name:'再拼'}),true);
 assert.equal(supportsGuide({image:'data:image/jpeg;base64,abcd'}),true);
 for(const image of ['','images/6.jpg','https://example.org/0.jpg'])assert.equal(supportsGuide({image}),false);
});
