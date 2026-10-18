import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {recognizeGrid} from '../../../server/grid-vision.mjs';
import {VisionError} from '../../../server/vision.mjs';
import palette from '../../../public/studio/palette.json';
export const dynamic='force-dynamic';
const active=new Set<string>(),recent=new Map<string,number[]>(),validCodes=new Set(palette.map(c=>c.code));
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'请登录后生成定位。'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'请求来源无效。'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'请求格式无效。'},415);
 if(Number(request.headers.get('content-length'))>12100000)return json({error:'图片过大。'},413);
 const now=Date.now(),times=(recent.get(user.userId)||[]).filter(t=>now-t<60000);
 if(active.has(user.userId)||times.length>=8)return json({error:'定位任务正在处理，或请求过于频繁，请稍后重试。'},429);
 active.add(user.userId);recent.set(user.userId,[...times,now]);
 try{
  const text=await request.text();if(text.length>12100000)return json({error:'图片过大。'},413);
  let body;try{body=JSON.parse(text)}catch{return json({error:'请求格式无效。'},400)}
  const codes=Array.isArray(body.codes)?body.codes.filter((c:unknown)=>typeof c==='string'&&validCodes.has(c)):[];
  const vars=env as unknown as Record<string,string>;
  return json(await recognizeGrid({kind:body.kind,image:body.image,images:body.images,codes,count:body.count,verify:body.verify===true,key:vars.OPENAI_API_KEY}));
 }catch(e){if(e instanceof VisionError)return json({error:e.message,code:e.code},e.status);return json({error:'生成定位失败，请重试。'},500)}
 finally{active.delete(user.userId);for(const[id,ts]of recent)if(!ts.some(t=>Date.now()-t<60000))recent.delete(id)}
}
