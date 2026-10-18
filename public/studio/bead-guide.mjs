import {imageKey,readGrid,writeGrid} from './grid-cache.mjs';
import {setupUploadedGrid} from './grid-setup.mjs';
import {gridCounts,gridDifferences,validateGrid} from './grid-core.mjs';
// Grid positions are measured from the six original diagrams, independently of inventory.
export function cellAtPoint(grid, x, y) {
  const [left, top, right, bottom] = grid.bounds;
  if (x < left || x >= right || y < top || y >= bottom) return null;
  const column = Math.floor((x - left) * grid.cols / (right - left));
  const row = Math.floor((y - top) * grid.rows / (bottom - top));
  return {row, column, code: grid.cells[row][column]};
}
export function colorPositions(grid, code) {
  const positions = [];
  grid.cells.forEach((row, r) => row.forEach((value, c) => {
    if (value && (!code || value === code)) positions.push({row:r, column:c, code:value});
  }));
  return positions;
}
let gridRequest, activeGuide = 0, activeController;
async function loadGrids() {
  if (!gridRequest) gridRequest = fetch('grids.json').then(r => {
    if (!r.ok) throw Error('图纸位置数据暂时无法加载，请稍后再试。');
    return r.json();
  }).catch(e => { gridRequest = null; throw e; });
  return gridRequest;
}
export function supportsGuide(pattern) { return typeof pattern.image==='string'&&(/^images\/[0-5]\.jpg$/.test(pattern.image)||/^data:image\/(jpeg|png|webp);base64,/.test(pattern.image)); }

export async function openBeadGuide({pattern, esc, adjust=false}) {
  const requestId = ++activeGuide;
  activeController?.abort();const controller=new AbortController();activeController=controller;
  let dialog = document.querySelector('#beadGuide');
  if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'beadGuide'; document.body.append(dialog); }
  dialog.className = 'bead-guide';
  dialog.innerHTML = `<div class="dialog-head"><div><small>专注拼豆</small><h2>${esc(pattern.name)}</h2></div><button class="guide-close" aria-label="关闭专注拼豆">✕</button></div><p role="status">正在加载图纸位置…</p>`;
  dialog.querySelector('.guide-close').onclick = () => dialog.close();
  if(!dialog.open)dialog.showModal();
  dialog.addEventListener('close',()=>controller.abort(),{once:true});
  try {
    if(!supportsGuide(pattern))throw Error('这张图纸还没有可读取的图片，请先添加图纸图片。');
    const img = new Image(); img.src = pattern.image;await img.decode();
    if (!dialog.open || requestId !== activeGuide) return;
    const bundled=/^images\/[0-5]\.jpg$/.test(pattern.image);
    let grid,key=null,persisted=true;
    if(bundled){grid=(await loadGrids()).find(g=>g.image===pattern.image);if(!grid)throw Error('图纸定位数据暂时无法加载。')}
    else{
      key=await imageKey(pattern.image);grid=await readGrid(key);
      if(grid&&(grid.width!==img.naturalWidth||grid.height!==img.naturalHeight))grid=null;
      if(!grid||adjust){
        grid=await setupUploadedGrid({dialog,pattern,esc,image:img,signal:controller.signal,initial:adjust?grid:null});
        if(controller.signal.aborted)return;
        persisted=await writeGrid(key,grid);
      }
    }
    validateGrid(grid,{width:img.naturalWidth,height:img.naturalHeight,codes:grid.codes});
    if (!dialog.open || requestId !== activeGuide) return;
    const counts = Object.fromEntries(grid.codes.map(code => [code, colorPositions(grid, code).length]));
    const ordered = [...grid.codes].sort((a,b) => counts[b] - counts[a]);
    dialog.innerHTML = `<div class="dialog-head"><div><small>专注拼豆 · ${grid.cols} × ${grid.rows}</small><h2>${esc(pattern.name)}</h2></div><button class="guide-close" aria-label="关闭专注拼豆">✕</button></div>
      <div class="guide-toolbar"><div id="guideStatus" role="status" aria-live="polite"></div><div class="guide-tools">${key?'<button id="guideEdit">修正格子</button><button id="guideRebuild">调整网格</button>':''}<button id="guideReset">显示全部</button><label>缩放 <select id="guideZoom" aria-label="图纸缩放"><option value="1">适应宽度</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select></label></div></div>
      <div id="guideAudit" class="guide-audit" role="status"></div>${key?'<div id="guideEditor" class="notice" hidden>先选择色号，再点需要修正的格子。<button id="guideBlank">空白画笔</button><span id="guideSaveState"></span></div>':''}<div class="guide-layout"><div class="guide-board-wrap"><div class="guide-board" tabindex="0" role="region" aria-label="拼豆图纸，可滚动放大；点击格子选择色号"><canvas id="guideCanvas" role="img" aria-label="${esc(pattern.name)}拼豆图纸"></canvas></div><div class="guide-board-foot"><span id="guidePoint">点击格子，或右侧选择色号</span><a href="${esc(pattern.image)}" target="_blank" rel="noreferrer">查看原图 ↗</a></div></div><aside class="guide-colors" aria-label="图纸色号"><div class="guide-colors-title">选择一个色号<small>按颗数从多到少</small></div><div class="guide-color-list">${ordered.map(code => `<button class="guide-color" data-focus-code="${code}" aria-pressed="false" aria-label="聚焦 ${code}，${counts[code]} 颗"><span class="guide-dot" style="background:${grid.colors[grid.codes.indexOf(code)]}"></span><b>${code}</b><span class="guide-count">${counts[code]} 颗</span></button>`).join('')}</div><p>其他豆子变为黑白；选中色号保留原色并描边。白色和黑色豆子也能看清位置。</p></aside></div>
      <p class="guide-note">点击同一色号或「显示全部」恢复。这里只帮助定位，查看与切换色号不会扣库存。</p>`;
    const canvas = dialog.querySelector('#guideCanvas'), ctx = canvas.getContext('2d');
    const board = dialog.querySelector('.guide-board');
    // Include the original row/column rulers in every zoom level.
    const [left,top,right,bottom] = grid.bounds;
    const dx = (right-left)/grid.cols, dy = (bottom-top)/grid.rows;
    const crop = [Math.max(0,left-dx),Math.max(0,top-dy),Math.min(img.naturalWidth,right+dx),Math.min(img.naturalHeight,bottom+dy)];
    canvas.width = Math.ceil(crop[2]-crop[0]); canvas.height = Math.ceil(crop[3]-crop[1]);
    const sx = canvas.width/(crop[2]-crop[0]), sy = canvas.height/(crop[3]-crop[1]);
    let selected = null,editing=false,brush=null;
    function audit(){const diffs=gridDifferences(grid,pattern.usage),unknown=grid.unknown?.length||0;dialog.querySelector('#guideAudit').textContent=(!persisted?'本次定位暂未持久保存，刷新后可能需要重新生成。 ':'')+(diffs.length?'位置数需核对：'+diffs.slice(0,8).map(d=>d.code+' 定位'+d.actual+'/用量'+d.expected).join('；')+(diffs.length>8?'…':''):'✓ 逐色位置数与用量表一致')+(unknown?' · '+unknown+' 个待核对格子已标橙框':'')+(grid.estimatedUsd?' · 首次模型费用约 $'+grid.estimatedUsd.toFixed(4):'');}

    function draw() {
      ctx.filter = 'none'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.filter = selected ? 'grayscale(1)' : 'none';
      ctx.globalAlpha = selected ? 0.27 : 1;
      ctx.drawImage(img,...[crop[0],crop[1],crop[2]-crop[0],crop[3]-crop[1]],0,0,canvas.width,canvas.height);
      ctx.filter = 'none'; ctx.globalAlpha = 1;
      if (selected) {
        ctx.strokeStyle = '#28714a'; ctx.lineWidth = Math.max(1,dx*.045);
        for (const {row,column} of colorPositions(grid, selected)) {
          const x=left+column*dx, y=top+row*dy, xx=(x-crop[0])*sx, yy=(y-crop[1])*sy;
          ctx.drawImage(img,x,y,dx,dy,xx,yy,dx*sx,dy*sy);
          ctx.strokeRect(xx+1,yy+1,dx*sx-2,dy*sy-2);
        }
      }
      for(const [r,c]of grid.unknown||[]){ctx.strokeStyle='#b87816';ctx.lineWidth=2;ctx.strokeRect((left+c*dx-crop[0])*sx+2,(top+r*dy-crop[1])*sy+2,dx*sx-4,dy*sy-4)}
      Object.assign(counts,Object.fromEntries(grid.codes.map(code=>[code,colorPositions(grid,code).length])));
      canvas.setAttribute('aria-label', selected ? `${pattern.name}：突出 ${selected} 的 ${counts[selected]} 个位置，其余为黑白` : `${pattern.name}：显示全部色号`);
      dialog.querySelector('#guideStatus').innerHTML = selected ? `<strong>${selected}</strong><span>本张 ${counts[selected]} 颗 · 已突出全部位置</span>` : `<strong>全部色号</strong><span>${grid.codes.length} 色 · ${Object.values(counts).reduce((a,b)=>a+b,0)} 颗</span>`;
      dialog.querySelectorAll('[data-focus-code]').forEach(b => {b.setAttribute('aria-pressed',String(b.dataset.focusCode===selected));b.querySelector('.guide-count').textContent=counts[b.dataset.focusCode]+' 颗';b.setAttribute('aria-label','聚焦 '+b.dataset.focusCode+'，'+counts[b.dataset.focusCode]+' 颗')});
      [...dialog.querySelectorAll('[data-focus-code]')].sort((a,b)=>counts[b.dataset.focusCode]-counts[a.dataset.focusCode]||a.dataset.focusCode.localeCompare(b.dataset.focusCode)).forEach(b=>b.parentNode.appendChild(b));
      audit();
      dialog.querySelector('#guideReset').disabled = !selected;
    }
    function select(code) { selected = editing?code:selected === code ? null : code;if(editing)brush=code; draw(); }
    dialog.querySelectorAll('[data-focus-code]').forEach(b => b.onclick = () => select(b.dataset.focusCode));
    dialog.querySelector('#guideReset').onclick = () => { selected = null; draw(); };
    dialog.querySelector('#guideZoom').onchange = e => { canvas.style.width = `${Number(e.target.value)*100}%`; };
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return cellAtPoint(grid, crop[0]+(event.clientX-rect.left)/rect.width*(crop[2]-crop[0]), crop[1]+(event.clientY-rect.top)/rect.height*(crop[3]-crop[1]));
    }
    if(key){
      dialog.querySelector('#guideEdit').onclick=()=>{editing=!editing;dialog.querySelector('#guideEditor').hidden=!editing;dialog.querySelector('#guideEdit').textContent=editing?'结束修正':'修正格子';if(editing){selected=selected||ordered[0];brush=selected}draw()};
      dialog.querySelector('#guideBlank').onclick=()=>{brush=null;selected=null;draw();dialog.querySelector('#guideSaveState').textContent='当前：空白画笔'};
      dialog.querySelector('#guideRebuild').onclick=()=>openBeadGuide({pattern,esc,adjust:true});
    }
    function describe(cell) { dialog.querySelector('#guidePoint').textContent = cell ? `第 ${cell.row+1} 行 · 第 ${cell.column+1} 列 · ${cell.code||'空白格'}` : '点击格子，或选择色号'; }
    canvas.onclick = async e => { const cell=point(e); describe(cell);if(!cell)return;if(editing&&key){grid.cells[cell.row][cell.column]=brush;describe({...cell,code:brush});grid.unknown=(grid.unknown||[]).filter(([r,c])=>r!==cell.row||c!==cell.column);draw();persisted=await writeGrid(key,grid);if(!controller.signal.aborted){dialog.querySelector('#guideSaveState').textContent=persisted?'定位修正已保存，库存未改变':'修正仅在本次保留';audit()}}else if(cell.code)select(cell.code); };
    canvas.onpointermove = e => describe(point(e));
    dialog.querySelector('.guide-close').onclick = () => dialog.close();
    draw(); board.scrollTop=0; board.scrollLeft=0;
  } catch(e) {
    if (dialog.open && requestId === activeGuide && !controller.signal.aborted) { dialog.querySelector('[role=status]').textContent=e.message||'加载失败，请关闭后重试。'; }
  }
}
