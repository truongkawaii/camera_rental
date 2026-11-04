const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
process.env.DB_AUTO_INIT='false';
const {pool}=require('../utils/db');
const router=require('../routes/rentals');
test('driver can update a historical handover assignment; new assignments still require driver role',async()=>{
 const savedConnect=pool.connect,savedQuery=pool.query;
 const old={id:1,customer_id:1,equipment_id:1,branch_id:1,start_date:'2026-11-04',end_date:'2026-11-05',start_period:'sáng',end_period:'chiều',status:'pending',user_id:99,handover_user_id:33,total_price:200000,discount_amount:0,discount_type:'fixed'};
 let validations=0,updates=0,lastHandover;
 const query=async(sql,values=[])=>{
  if(sql.includes('SELECT r.*, c.name')) return {rows:[old]};
  if(sql.includes('SELECT ri.*, e.owner_id')) return {rows:[]};
  if(sql.includes('SELECT id, name, code, category, price_per_day, price_per_session')) return {rows:[{id:1,name:'Camera',price_per_day:100000,price_per_session:50000,branch_id:1,condition:'good'}]};
  if(sql.includes('FROM users u') && sql.includes("r.name = 'driver'")){validations++;return {rows:Number(values[0])===35?[{id:35}]:[]};}
  if(/UPDATE rentals\s+SET/.test(sql)) {updates++;lastHandover=values[25];throw new Error('TEST_REACHED_RENTAL_WRITE');}
  return {rows:[],rowCount:0};
 };
 pool.connect=async()=>({query,release(){}});pool.query=query;
 const app=express();app.use(express.json());app.use('/rentals',router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const token=jwt.sign({id:35,roles:['saler','driver']},process.env.JWT_SECRET||'fallback_secret');
 async function save(body){const r=await fetch(`http://127.0.0.1:${server.address().port}/rentals/1`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'X-Active-Role':'driver','Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 try{
  // Stop at the database write, after all real route validation and pricing.
  for(const body of [{notes:'Cập nhật'}, {handover_user_id:'33',notes:'Cập nhật'}]){
   const before=updates;const result=await save(body);assert.equal(updates,before+1,JSON.stringify(result));assert.equal(lastHandover,33);assert.equal(validations,0);
  }
  const rejected=await save({handover_user_id:34});assert.equal(rejected.status,400);assert.match(rejected.data.error,/vai trò Giao nhận/);assert.equal(updates,2);
  await save({handover_user_id:35});assert.equal(updates,3);assert.equal(lastHandover,35);assert.equal(validations,2);
  await save({handover_user_id:''});assert.equal(updates,4);assert.equal(lastHandover,null);
 }finally{pool.connect=savedConnect;pool.query=savedQuery;await new Promise(resolve=>server.close(resolve));}
});
