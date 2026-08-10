export const J=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const now=()=>new Date().toISOString();
export const id=(prefix='id')=>`${prefix}_${crypto.randomUUID()}`;
export const num=v=>Number.isFinite(Number(v))?Number(v):0;
export const money=v=>Math.max(0,Math.round(num(v)));
export const text=v=>String(v??'').trim();
export const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
export async function q(db,sql,...params){return db.prepare(sql).bind(...params).all()}
export async function one(db,sql,...params){return db.prepare(sql).bind(...params).first()}
export async function run(db,sql,...params){return db.prepare(sql).bind(...params).run()}
