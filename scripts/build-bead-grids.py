"""Build calibrated positions for the six bundled charts. Never adjusts cells to fit totals.
Requires Pillow, numpy, scipy. References/ambiguous glyphs are annotated in grid-data/.
All annotation coordinates are one-based (row, column); output arrays are zero-based.
"""
from pathlib import Path
import collections, hashlib, json
import numpy as np
from PIL import Image
from scipy.spatial.distance import cdist

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/studio'
CALIBRATION = Path(__file__).parent / 'grid-data'
LAYOUTS = [
    (52,52,[36.5,41.5,1243.5,1248.5]),
    (52,52,[36.5,40.5,1243.5,1248.5]),
    (57,63,[33.5,37.5,1246,1378]),
    (52,52,[36.5,43.5,1243.5,1251.5]),
    (52,52,[23.5,23.5,1256,1256]),
    (25,25,[72,153,1208,1290]),
]

def median(pixels):
    return np.median(pixels.reshape(-1,3), axis=0)

def features(im, bounds, cols, rows):
    a = np.asarray(im); left,top,right,bottom = bounds
    dx,dy = (right-left)/cols,(bottom-top)/rows
    items = []
    for r in range(rows):
        for c in range(cols):
            x,y = left+c*dx,top+r*dy
            tile = a[round(y+dy*.16):round(y+dy*.84),round(x+dx*.15):round(x+dx*.85)]
            band = max(1,round(dy*.15))
            bg = median(np.concatenate([tile[:band].reshape(-1,3),tile[-band:].reshape(-1,3)]))
            if bg.min() > 230:
                center = a[round(y+dy*.3):round(y+dy*.7),round(x+dx*.2):round(x+dx*.8)]
                if (center.mean(2)<150).sum() < max(5,center.shape[0]*center.shape[1]*.04):
                    continue  # A white bead has an inked code; an empty cell does not.
            cut = im.crop((round(x+dx*.13),round(y+dy*.27),round(x+dx*.87),round(y+dy*.76)))
            arr = np.asarray(cut).astype(float)
            bg = median(np.concatenate([
                a[round(y+dy*.17):round(y+dy*.29),round(x+dx*.15):round(x+dx*.85)].reshape(-1,3),
                a[round(y+dy*.73):round(y+dy*.85),round(x+dx*.15):round(x+dx*.85)].reshape(-1,3)]))
            strength = np.clip((np.abs(arr.mean(2)-bg.mean())-12)*3,0,255)
            mask = np.asarray(Image.fromarray(strength.astype('uint8')).resize((28,18)))
            feature = np.r_[bg/8,mask.reshape(-1)/255/np.sqrt(12)]
            items.append(dict(row=r,column=c,bg=bg,feature=feature))
    return items

references = json.loads((CALIBRATION/'references.json').read_text())
reviewed = json.loads((CALIBRATION/'reviewed-cells.json').read_text())
seed = json.loads((ASSETS/'seed.json').read_text())
grids,report = [],[]
for i,(cols,rows,bounds) in enumerate(LAYOUTS):
    image = f'images/{i}.jpg'; path = ASSETS/image
    im = Image.open(path).convert('RGB'); items = features(im,bounds,cols,rows)
    lookup = {(t['row']+1,t['column']+1):k for k,t in enumerate(items)}
    training,labels,colors = [],[],{}
    for code,positions in references[i].items():
        for pos in positions:
            item = items[lookup[tuple(pos)]];training.append(item['feature']);labels.append(code)
        rgb = np.median([items[lookup[tuple(p)]]['bg'] for p in positions],axis=0).astype(int)
        colors[code] = '#'+''.join(f'{v:02x}' for v in rgb)
    distances = cdist(np.array([t['feature'] for t in items]),np.array(training))
    assignments = [labels[k] for k in np.argmin(distances,axis=1)]
    overrides = {(r,c):code for r,c,code in reviewed.get(str(i),[])}
    cells = [[None]*cols for _ in range(rows)]
    for item,code in zip(items,assignments):
        r,c = item['row'],item['column']
        cells[r][c] = overrides.get((r+1,c+1),code)
    for (r,c),code in overrides.items():
        assert (r,c) in lookup, f'Override is outside detected cells: {i} {r},{c}'
        cells[r-1][c-1] = code
    counts = collections.Counter(code for row in cells for code in row if code)
    expected = seed[i]['usage']
    difference = {c:[expected.get(c,0),counts.get(c,0)] for c in set(counts)|set(expected) if counts.get(c,0)!=expected.get(c,0)}
    if difference:
        raise ValueError(f'Chart {i} positional count differs from independently checked legend: {difference}')
    codes = sorted(counts,key=lambda c:-counts[c])
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    grids.append(dict(image=image,sha256=digest,width=im.width,height=im.height,cols=cols,rows=rows,bounds=bounds,codes=codes,colors=[colors[c] for c in codes],cells=cells))
    report.append(dict(image=image,name=seed[i]['name'],sha256=digest,rows=rows,columns=cols,positions=sum(counts.values()),counts=dict(counts),legendMatches=True,reviewedCells=len(overrides)))
# Only write after all six passed; a failed generation cannot replace a working map.
(ASSETS/'grids.json').write_text(json.dumps(grids,separators=(',',':'))+'\n')
(ROOT/'reports/grid-acceptance.json').write_text(json.dumps(dict(passed=True,charts=report),ensure_ascii=False,indent=2)+'\n')
print(f'Validated {len(grids)} charts, {sum(r["positions"] for r in report)} bead positions')
