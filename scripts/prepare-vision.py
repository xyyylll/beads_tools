from PIL import Image
import sys,json,math,statistics
source=Image.open(sys.argv[1]).convert('RGB');sw,sh=source.size
legend=source.crop((0,int(sh*.78),sw,sh)).resize((sw*2,int(sh*.22)*2))
legend.save(sys.argv[2]);w=1280;h=round(legend.height*w/legend.width);im=legend.resize((w,h));pix=im.load();seen=bytearray(w*h);boxes=[];minimum=max(18,w*.019)
for y in range(h):
 for x in range(w):
  idx=y*w+x
  if seen[idx]:continue
  bg=pix[x,y];q=[(x,y)];seen[idx]=1;count=0;x0=x1=x;y0=y1=y
  while q:
   xx,yy=q.pop();count+=1;x0=min(x0,xx);x1=max(x1,xx);y0=min(y0,yy);y1=max(y1,yy)
   for nx,ny in [(xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)]:
    if nx<0 or ny<0 or nx>=w or ny>=h:continue
    ni=ny*w+nx
    if not seen[ni] and max(abs(pix[nx,ny][c]-bg[c])for c in range(3))<26:seen[ni]=1;q.append((nx,ny))
  bw=x1-x0+1;bh=y1-y0+1
  if y0>1 and bw>=minimum and bh>=minimum and bw<w*.1 and bh<w*.1 and .7<bw/bh<1.4 and count/(bw*bh)>.45:boxes.append(dict(x0=x0,x1=x1,y0=y0,y1=y1))
boxes=[a for a in boxes if not any(a!=b and a['x0']>=b['x0']and a['x1']<=b['x1']and a['y0']>=b['y0']and a['y1']<=b['y1']for b in boxes)]
groups=[]
for b in sorted(boxes,key=lambda b:b['y0']):
 g=next((g for g in groups if abs(g[0]['y0']-b['y0'])<(b['y1']-b['y0'])*.35),None)
 if g is None:g=[];groups.append(g)
 g.append(b)
main=[g for g in groups if len(g)>=4]
if not main:print(json.dumps({'focus':False,'tiles':0}));sys.exit(0)
size=max(sorted(b['x1']-b['x0']for b in g)[len(g)//2]for g in main)
boxes=[b for g in groups if all(abs((b['x1']-b['x0'])-size)<size*.28 for b in g)for b in g]
rows=[]
for b in boxes:
 row=next((r for r in rows if abs(r[0]['y0']-b['y0'])<size*.4),None)
 if row is None:row=[];rows.append(row)
 row.append(b)
for row in rows:
 row.sort(key=lambda b:b['x0']);gaps=sorted(row[i+1]['x0']-row[i]['x0']for i in range(len(row)-1));pitch=gaps[len(gaps)//2]if gaps else None
 if pitch:
  for a,b in zip(row,row[1:]):
   gap=b['x0']-a['x0']
   if pitch*1.6<gap<pitch*3.5:
    x=a['x0']+pitch
    while x<b['x0']-pitch*.5:boxes.append(dict(a,x0=x,x1=x+a['x1']-a['x0']));x+=pitch
boxes.sort(key=lambda b:(round(b['y0']/max(1,size*.4)),b['x0']))
cols=min(4,len(boxes));tw=260;th=330;out=Image.new('RGB',(cols*tw,math.ceil(len(boxes)/cols)*th),'white')
for i,b in enumerate(boxes):
 bw=b['x1']-b['x0'];bh=b['y1']-b['y0'];x=max(0,b['x0']-bw*.2);y=max(0,b['y0']-3);cw=min(w-x,bw*1.4);ch=min(h-y,bh*1.85);scale=min((tw-24)/cw,(th-24)/ch)
 tile=legend.crop((int(x/w*legend.width),int(y/h*legend.height),int((x+cw)/w*legend.width),int((y+ch)/h*legend.height))).resize((round(cw*scale),round(ch*scale)))
 out.paste(tile,(round(i%cols*tw+(tw-cw*scale)/2),i//cols*th+12))
out.save(sys.argv[2]+'.focus.png');print(json.dumps({'focus':True,'tiles':len(boxes)}))
