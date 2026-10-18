import {validateGrid} from './grid-core.mjs';
const memory=new Map(),keys=new Map();
let database;
export async function imageKey(image){
 if(!keys.has(image))keys.set(image,crypto.subtle.digest('SHA-256',new TextEncoder().encode(image)).then(bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')));
 return keys.get(image);
}
function openDB(){
 if(!database)database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('bead-studio-focus',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('grids',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('定位缓存暂不可用'));
 }).catch(e=>{database=null;throw e});
 return database;
}
function check(entry){
 if(!entry||entry.version!==1||typeof entry.key!=='string'||!/^[a-f0-9]{64}$/.test(entry.key))throw Error('定位备份格式无效');
 const g=entry.grid;
 if(!g||!Number.isFinite(g.width)||!Number.isFinite(g.height)||g.width<1||g.height<1||g.width>10000||g.height>10000||!Array.isArray(g.codes)||g.codes.length>221||!g.codes.length||!g.codes.every(c=>/^[A-M]\d{1,2}$/.test(c))||!Array.isArray(g.colors)||g.colors.length!==g.codes.length||!g.colors.every(c=>/^#[a-f0-9]{6}$/i.test(c)))throw Error('定位备份内容无效');
 validateGrid(g,{width:g.width,height:g.height,codes:g.codes});
 if(g.unknown&&!g.unknown.every(p=>Array.isArray(p)&&p.length===2&&Number.isInteger(p[0])&&Number.isInteger(p[1])&&p[0]>=0&&p[0]<g.rows&&p[1]>=0&&p[1]<g.cols))throw Error('待核对格子格式无效');
 return entry;
}
export async function readGrid(key){
 if(memory.has(key))return structuredClone(memory.get(key));
 try{const db=await openDB(),entry=await new Promise((resolve,reject)=>{const r=db.transaction('grids').objectStore('grids').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(!entry)return null;check(entry);memory.set(key,entry.grid);return structuredClone(entry.grid)}catch{return null}
}
export async function writeGrid(key,grid){
 const entry=check({key,version:1,grid:structuredClone(grid)});memory.set(key,entry.grid);
 try{const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction('grids','readwrite');tx.objectStore('grids').put(entry);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});return true}catch{return false}
}
export async function exportGridCache(patterns){
 const hashes=[...new Set(await Promise.all(patterns.filter(p=>p.image.startsWith('data:image/')).map(p=>imageKey(p.image))))];
 const entries=await Promise.all(hashes.map(async key=>{const grid=await readGrid(key);return grid?{version:1,key,grid}:null}));return entries.filter(Boolean);
}
export function validateGridBackup(entries){
 if(entries===undefined)return[];
 if(!Array.isArray(entries)||entries.length>200)throw Error('定位备份数量无效');
 return entries.map(check);
}
export async function importGridCache(entries,patterns){
 const valid=validateGridBackup(entries),hashes=new Set(await Promise.all(patterns.filter(p=>p.image.startsWith('data:image/')).map(p=>imageKey(p.image))));
 let persisted=true;for(const entry of valid)if(hashes.has(entry.key))persisted=(await writeGrid(entry.key,entry.grid))&&persisted;return persisted;
}
