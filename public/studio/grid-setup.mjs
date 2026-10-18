import {imageCanvas,generateGrid} from './uploaded-grid.mjs';
import {gridDifferences,gridCounts} from './grid-core.mjs';
export function setupUploadedGrid({dialog,pattern,esc,image,signal,initial=null}){
 const source=imageCanvas(image),w=source.width,h=source.height;
 return new Promise((resolve,reject)=>{
  let draft=null,busy=false;
  dialog.innerHTML=`<div class="dialog-head"><div><small>专注拼豆 · 首次生成定位</small><h2>${esc(pattern.name)}</h2></div><button class="guide-close" aria-label="关闭专注拼豆">✕</button></div>
   <p>读取已有图片中的网格和色号，不用重新上传。首次生成会调用模型；保存后，切换色号和再次打开直接复用。</p>
   <canvas id="gridSetupPreview" aria-label="网格范围预览"></canvas>
   <details id="gridAdjust" ${initial?'open':''}><summary>调整网格范围和行列数</summary><label class="grid-manual"><input id="useManualGrid" type="checkbox" ${initial?'checked':''}> 使用以下网格范围</label><div class="grid-fields">
   <label>列数<input id="gridCols" type="number" min="2" max="180" value="${initial?.cols||52}"></label><label>行数<input id="gridRows" type="number" min="2" max="180" value="${initial?.rows||52}"></label>
   ${['左边界','上边界','右边界','下边界'].map((name,i)=>`<label>${name} %<input data-bound="${i}" type="number" min="0" max="100" step="0.1" value="${initial?(initial.bounds[i]/(i%2?h:w)*100).toFixed(2):[3,3,97,90][i]}"></label>`).join('')}</div><p class="ocr-help">范围应包含整张网格和空白格，不包含坐标编号条、用量表。行列数以坐标轴为准。</p></details>
   <div id="gridSetupStatus" class="notice" role="status">点击生成后识别网格，并与图纸用量逐色对照。已有的库存和制作记录不受影响。</div>
   <div class="detail-actions"><button id="generateGrid" class="primary">${initial?'重新生成专注定位':'生成专注定位'}</button><button id="acceptGrid" hidden>进入并核对定位</button></div>`;
  const $=s=>dialog.querySelector(s),preview=$('#gridSetupPreview'),ctx=preview.getContext('2d');preview.width=w;preview.height=h;
  function geometry(){const cols=Number($('#gridCols').value),rows=Number($('#gridRows').value),bounds=[...dialog.querySelectorAll('[data-bound]')].map((el,i)=>Number(el.value)/100*(i%2?h:w));
   if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||rows<2||cols>180||rows>180||bounds.some(n=>!Number.isFinite(n))||bounds[0]<0||bounds[1]<0||bounds[2]>w||bounds[3]>h||bounds[2]<=bounds[0]||bounds[3]<=bounds[1])throw Error('请填写有效的行列数与网格范围。');
   return {width:w,height:h,cols,rows,bounds};
  }
  function draw(){ctx.drawImage(source,0,0);if(!$('#useManualGrid').checked)return;try{const g=geometry(),[l,t,r,b]=g.bounds;ctx.strokeStyle='#268154';ctx.lineWidth=Math.max(3,w/400);ctx.strokeRect(l,t,r-l,b-t)}catch{}}
  dialog.querySelectorAll('input').forEach(el=>el.oninput=draw);draw();
  $('.guide-close').onclick=()=>dialog.close();
  const abort=()=>reject(new DOMException('已关闭定位生成','AbortError'));if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});
  const done=grid=>{signal.removeEventListener('abort',abort);resolve(grid)};
  $('#acceptGrid').onclick=()=>{if(draft)done(draft)};
  $('#generateGrid').onclick=async()=>{
   if(busy)return;
   try{
    const manual=$('#useManualGrid').checked?geometry():null;
    busy=true;$('#generateGrid').disabled=true;$('#acceptGrid').hidden=true;dialog.querySelectorAll('input').forEach(i=>i.disabled=true);
    draft=await generateGrid({source,pattern,signal,geometry:manual,onProgress:s=>{if(!signal.aborted)$('#gridSetupStatus').textContent=s}});
    if(signal.aborted)return;
    const differences=gridDifferences(draft,pattern.usage),unread=draft.unknown.length,total=Object.values(gridCounts(draft)).reduce((a,b)=>a+b,0);
    if(!differences.length&&!unread){done(draft);return}
    $('#gridSetupStatus').textContent=`已生成 ${draft.cols} × ${draft.rows} 网格、${total} 个位置。${differences.length?differences.length+' 个色号的位置数与用量表不一致。':''}${unread?'另有 '+unread+' 个格子待核对。':''}可进入修正模式逐格核对，或调整网格范围后重新生成。`;
    $('#acceptGrid').hidden=false;$('#generateGrid').textContent='重新生成';
   }catch(e){if(!signal.aborted){$('#gridSetupStatus').textContent=e.message||'生成定位失败，请重试。';$('#gridAdjust').open=true}}
   finally{if(!signal.aborted){busy=false;$('#generateGrid').disabled=false;dialog.querySelectorAll('input').forEach(i=>i.disabled=false)}}
  };
 });
}
