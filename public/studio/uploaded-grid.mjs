import {refineGrid,sampleCells,selectPrototypes,gridCounts,gridDifferences,validateGrid,classifyCells} from './grid-core.mjs';
export async function gridRequest(payload,signal){
 const response=await fetch('/api/grid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
 let data;try{data=await response.json()}catch{throw Error('定位服务响应异常，请稍后重试。')}
 if(!response.ok)throw Error(data.error||'生成定位失败，请重试。');return data;
}
export function imageCanvas(image){
 const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
 if(!c.width||!c.height||c.width*c.height>40000000)throw Error('图纸图片过大或无法读取。');
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0);return c;
}
export function prototypeSheets(source,grid,prototypes){
 const sheets=[],[left,top,right,bottom]=grid.bounds,dx=(right-left)/grid.cols,dy=(bottom-top)/grid.rows;
 for(let offset=0;offset<prototypes.length;offset+=80){
  const subset=prototypes.slice(offset,offset+80),canvas=document.createElement('canvas');canvas.width=960;canvas.height=Math.ceil(subset.length/8)*116;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#222';ctx.font='14px sans-serif';
  subset.forEach((p,i)=>{const x=left+p.column*dx,y=top+p.row*dy,size=96,scale=Math.min(size/(dx-2),size/(dy-2)),cw=(dx-2)*scale,ch=(dy-2)*scale;ctx.drawImage(source,x+1,y+1,dx-2,dy-2,i%8*120+(120-cw)/2,Math.floor(i/8)*116+2,cw,ch);ctx.fillText('#'+(offset+i),i%8*120+10,Math.floor(i/8)*116+112)});
  sheets.push(canvas.toDataURL('image/png'));
 }
 return sheets;
}
export function assembleGrid(geometry,cells,selected,labels,codes){
 const classified=classifyCells(cells,selected,labels);labels=classified.labels;
 const grid={...geometry,cells:Array.from({length:geometry.rows},()=>Array(geometry.cols).fill(null)),codes:[...codes],colors:[],unknown:[],generated:true,createdAt:new Date().toISOString()};
 for(const code of codes){const proto=selected.prototypes.find((_,i)=>labels[i]?.code===code);grid.colors.push(proto?'#'+proto.bg.map(n=>Math.round(n).toString(16).padStart(2,'0')).join(''):'#eeeeee')}
 cells.forEach((cell,i)=>{const label=labels[classified.assignment[i]],code=label?.code||null;grid.cells[cell.row][cell.column]=code;if(!code||label.uncertain)grid.unknown.push([cell.row,cell.column])});
 return validateGrid(grid,{width:geometry.width,height:geometry.height,codes});
}
export async function generateGrid({source,pattern,signal,onProgress=()=>{},geometry=null}){
 let cost=0;const codes=Object.keys(pattern.usage),pixels=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height);
 if(!geometry){onProgress('1/3 正在识别网格行列和范围…');const layout=await gridRequest({kind:'layout',image:source.toDataURL('image/jpeg',.94)},signal);cost+=layout.usage?.estimatedUsd||0;geometry=refineGrid(pixels,layout)}
 onProgress('2/3 正在读取格内色号，生成逐格位置…');
 const cells=sampleCells(pixels,geometry),selected=selectPrototypes(cells,codes.length),result=await gridRequest({kind:'labels',images:prototypeSheets(source,geometry,selected.prototypes),count:selected.prototypes.length,codes},signal);
 cost+=result.usage?.estimatedUsd||0;const labels=result.labels;
 let grid=assembleGrid(geometry,cells,selected,labels,codes),differences=gridDifferences(grid,pattern.usage);
 const flagged=new Set(differences.map(d=>d.code));
 const review=selected.prototypes.map((p,i)=>({p,i})).filter(({i})=>!labels[i]?.code||labels[i]?.uncertain||flagged.has(labels[i].code));
 if(review.length){
  onProgress('3/3 正在独立复核易混淆色号…');
  const check=await gridRequest({kind:'labels',images:prototypeSheets(source,geometry,review.map(r=>r.p)),count:review.length,codes,verify:true},signal);cost+=check.usage?.estimatedUsd||0;
  review.forEach(({i},j)=>labels[i]={...check.labels[j],tile:i});grid=assembleGrid(geometry,cells,selected,labels,codes);
 }
 grid.estimatedUsd=cost;grid.positionCount=Object.values(gridCounts(grid)).reduce((a,b)=>a+b,0);return grid;
}
