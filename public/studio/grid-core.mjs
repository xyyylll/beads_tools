// Image geometry and cell features run locally. No inventory amounts are used to assign cells.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function refineGrid({data,width:w,height:h},layout){
 const gray=new Float32Array(w*h),vx=new Float64Array(w),hy=new Float64Array(h);
 for(let i=0;i<gray.length;i++)gray[i]=(data[i*4]+data[i*4+1]+data[i*4+2])/3;
 for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){const i=y*w+x,p=gray[i];if(y%2===0&&p+20<Math.max(gray[i-3],gray[i+3]))vx[x]++;if(x%2===0&&p+20<Math.max(gray[i-3*w],gray[i+3*w]))hy[y]++}
 function axis(profile,start,end,count,wide=false){
  const initial=(end-start)/count,normalizer=Math.max(...profile)||1;let best={score:-Infinity,start,end};
  for(let pitch=initial*(wide?.92:.96);pitch<=initial*(wide?1.08:1.04);pitch+=.025)for(let offset=-initial*(wide?1.4:.65);offset<=initial*(wide?1.4:.65);offset+=.5){
   const left=start+offset,right=left+pitch*count;if(left<0||right>profile.length)continue;
   let score=0;for(let k=0;k<=count;k++){const p=Math.round(left+k*pitch);score+=Math.max(profile[p-1]||0,profile[p]||0,profile[p+1]||0)/normalizer}
   score/=count+1;score-=.018*(Math.abs(left-start)+Math.abs(right-end))/initial;
   if(score>best.score)best={score,start:left,end:right};
  }
  if(!wide&&Math.abs((best.end-best.start)/(end-start)-1)>.035)return axis(profile,start,end,count,true);
  return [best.start,best.end];
 }
 const bounds=layout.bounds.map((n,i)=>n*(i%2?h:w)),x=axis(vx,bounds[0],bounds[2],layout.cols),y=axis(hy,bounds[1],bounds[3],layout.rows);
 return {cols:layout.cols,rows:layout.rows,width:w,height:h,bounds:[x[0],y[0],x[1],y[1]]};
}
function median(values){values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)]||0}
export function sampleCells({data,width:w,height:h},grid){
 const [left,top,right,bottom]=grid.bounds,dx=(right-left)/grid.cols,dy=(bottom-top)/grid.rows,items=[];
 const rgbAt=(x,y)=>{const k=(clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1))*4;return [data[k],data[k+1],data[k+2]]};
 for(let row=0;row<grid.rows;row++)for(let column=0;column<grid.cols;column++){
  const x=left+column*dx,y=top+row*dy,channels=[[],[],[]];
  for(const fy of [.18,.24,.78,.84])for(let fx=.15;fx<=.85;fx+=.07){const rgb=rgbAt(x+fx*dx,y+fy*dy);rgb.forEach((v,c)=>channels[c].push(v))}
  const bg=channels.map(median),level=(bg[0]+bg[1]+bg[2])/3;let ink=0,n=0;
  for(let fy=.32;fy<.74;fy+=.06)for(let fx=.15;fx<.94;fx+=.04){const rgb=rgbAt(x+fx*dx,y+fy*dy),lum=(rgb[0]+rgb[1]+rgb[2])/3;if(Math.abs(lum-level)>120)ink++;n++}
  if(Math.min(...bg)>228&&ink<Math.max(5,n*.05))continue;
  const glyph=[];
  for(let gy=0;gy<12;gy++)for(let gx=0;gx<20;gx++){const rgb=rgbAt(x+dx*(.08+(gx+.5)/20*.87),y+dy*(.29+(gy+.5)/12*.5));glyph.push(clamp((Math.abs((rgb[0]+rgb[1]+rgb[2])/3-level)-12)*3/255,0,1))}
  items.push({row,column,bg,feature:[...bg.map(v=>v/8),...glyph.map(v=>v/Math.sqrt(8))]});
 }
 return items;
}
export function featureDistance(a,b,weight=1){let sum=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];sum+=d*d*(i<3?1:weight)}return sum}
export function selectPrototypes(items,colorCount=20,max=320){
 if(!items.length)throw Error('网格中没有检测到可用的色号格子。');
 const target=Math.min(max,items.length,Math.max(32,colorCount*5)),chosen=[0],distance=new Float64Array(items.length).fill(Infinity);
 while(chosen.length<target){const last=items[chosen.at(-1)].feature;let best=-1,bestDist=-1;
  items.forEach((item,i)=>{distance[i]=Math.min(distance[i],featureDistance(item.feature,last));if(distance[i]>bestDist){bestDist=distance[i];best=i}});
  if(bestDist<.08)break;chosen.push(best);
 }
 const assignment=items.map(item=>{let best=0,dist=Infinity;chosen.forEach((index,i)=>{const d=featureDistance(item.feature,items[index].feature);if(d<dist){best=i;dist=d}});return best});
 return {prototypes:chosen.map(index=>items[index]),assignment};
}
export function validateGrid(grid,{width,height,codes=null}={}){
 if(!grid||!Number.isInteger(grid.cols)||!Number.isInteger(grid.rows)||grid.cols<1||grid.rows<1||grid.cols>180||grid.rows>180)throw Error('定位数据行列数无效。');
 if(!Array.isArray(grid.bounds)||grid.bounds.length!==4||!grid.bounds.every(Number.isFinite))throw Error('定位数据范围无效。');
 const [l,t,r,b]=grid.bounds;if(l<0||t<0||r<=l||b<=t||(width&&r>width)||(height&&b>height))throw Error('定位范围超出图纸。');
 if(!Array.isArray(grid.cells)||grid.cells.length!==grid.rows||!grid.cells.every(row=>Array.isArray(row)&&row.length===grid.cols))throw Error('定位格子数据不完整。');
 const allowed=codes?new Set(codes):null;
 for(const row of grid.cells)for(const code of row)if(code!==null&&(typeof code!=='string'||!/^[A-M]\d{1,2}$/.test(code)||(allowed&&!allowed.has(code))))throw Error('定位数据包含无效色号。');
 return grid;
}
export function gridCounts(grid){const counts={};for(const row of grid.cells)for(const code of row)if(code)counts[code]=(counts[code]||0)+1;return counts}
export function gridDifferences(grid,usage){const counts=gridCounts(grid);return [...new Set([...Object.keys(usage),...Object.keys(counts)])].filter(c=>(counts[c]||0)!==(usage[c]||0)).map(code=>({code,actual:counts[code]||0,expected:usage[code]||0}))}

export function classifyCells(items,selected,inputLabels){
 const labels=inputLabels.map(row=>({...row})),prototypes=selected.prototypes;
 const rgbDistance=(a,b)=>a.reduce((n,v,i)=>n+(v-b[i])**2,0);
 // Correct an isolated transcription only when two independently read samples
 // agree and both the cell background and glyph features support that code.
 inputLabels.forEach((label,i)=>{
  if(!label?.code||label.uncertain)return;
  const own=prototypes.flatMap((p,j)=>j!==i&&inputLabels[j]?.code===label.code?[{j,d:rgbDistance(p.bg,prototypes[i].bg)}]:[]).sort((a,b)=>a.d-b.d);
  const other=prototypes.flatMap((p,j)=>j!==i&&inputLabels[j]?.code&&inputLabels[j].code!==label.code&&!inputLabels[j].uncertain?[{j,d:rgbDistance(p.bg,prototypes[i].bg)}]:[]).sort((a,b)=>a.d-b.d);
  if(!own.length||other.length<2||own[0].d<=625||other[0].d>=225||other[1].d>=225||inputLabels[other[0].j].code!==inputLabels[other[1].j].code)return;
  const ownFeature=Math.min(...own.map(p=>featureDistance(prototypes[i].feature,prototypes[p.j].feature,3)));
  const otherFeature=featureDistance(prototypes[i].feature,prototypes[other[0].j].feature,3);
  if(ownFeature>otherFeature*1.5)labels[i]={...label,code:inputLabels[other[0].j].code,reconciled:true};
 });
 const assignment=items.map(item=>{let best=0,dist=Infinity;prototypes.forEach((p,i)=>{const d=featureDistance(item.feature,p.feature,3);if(d<dist){best=i;dist=d}});return best});
 return {labels,assignment};
}
