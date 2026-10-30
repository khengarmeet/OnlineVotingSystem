import http from "node:http";
import crypto from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const PORT = Number(process.env.PORT || 5000);
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "online_voting_system";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const client = new MongoClient(MONGO_URI);
let db;

const c = () => ({
  users: db.collection("users"),
  elections: db.collection("elections"),
  candidates: db.collection("candidates"),
  votes: db.collection("votes"),
  notifications: db.collection("notifications"),
  audit: db.collection("audit_logs")
});

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  });
  res.end(JSON.stringify(data));
}
function id(v) { try { return new ObjectId(v); } catch { return null; } }
async function body(req) { let s=""; for await (const x of req) s += x; try { return s ? JSON.parse(s) : {}; } catch { return {}; } }
function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function phoneOk(v) { return /^\d{10}$/.test(v); }
function escapeRegex(v) { return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function usernameOk(v) { return /^[A-Za-z0-9._-]{3,30}$/.test(v); }
function passwordOk(v) { return typeof v === "string" && v.length >= 6; }
function tokenFor(u) { return jwt.sign({ id:u._id.toString(), role:u.role, username:u.username }, JWT_SECRET, {expiresIn:"8h"}); }
function auth(req) { const h=req.headers.authorization||""; if(!h.startsWith("Bearer ")) return null; try{return jwt.verify(h.slice(7),JWT_SECRET);}catch{return null;} }
function requireAuth(req,res,roles=[]) { const u=auth(req); if(!u){send(res,401,{message:"Please login first."});return null;} if(roles.length&&!roles.includes(u.role)){send(res,403,{message:"Access denied."});return null;} return u; }
function publicUser(u){return {id:u._id.toString(),username:u.username,email:u.email,role:u.role,fullName:u.fullName,phone:u.phone||"",address:u.address||"",age:u.age??null,status:u.status||"active",createdAt:u.createdAt,emailValidated:!!u.emailValidated};}
async function audit(userId,action,details){await c().audit.insertOne({userId:userId?id(userId):null,action,details,createdAt:new Date()});}
async function notify({userId=null,targetRole="all",title,message,type="info"}){await c().notifications.insertOne({userId:userId?id(userId):null,targetRole,title,message,type,readBy:[],createdAt:new Date()});}
async function candidateView(x){const cc=c();const u=await cc.users.findOne({_id:x.userId},{projection:{password:0}});const e=await cc.elections.findOne({_id:x.electionId});return {...x,id:x._id.toString(),userId:x.userId.toString(),electionId:x.electionId?.toString(),fullName:u?.fullName||"Candidate",username:u?.username||"",email:u?.email||"",phone:u?.phone||"",electionTitle:e?.title||"Unknown election"};}

async function route(req,res){
  if(req.method==="OPTIONS"){send(res,204,{});return;}
  const url=new URL(req.url,`http://${req.headers.host}`), path=url.pathname, method=req.method, cc=c();
  try {
    if(method==="GET"&&path==="/api/health"){send(res,200,{ok:true,database:db.databaseName});return;}
    if(method==="GET"&&path==="/api/public/stats"){
      const now=new Date();
      const [voters,candidates,votes,elections]=await Promise.all([
        cc.users.countDocuments({role:"voter",status:{$ne:"deleted"}}),
        cc.candidates.countDocuments({status:"approved"}),
        cc.votes.countDocuments(),
        cc.elections.countDocuments({status:"active",startDate:{$lte:now},endDate:{$gte:now}})
      ]);
      send(res,200,{stats:{voters,candidates,votes,elections}});return;
    }

    if(method==="POST"&&path==="/api/auth/register"){
      const b=await body(req), role=b.accountType==="candidate"?"candidate":"voter";
      const fullName=String(b.fullName||"").trim(), username=String(b.username||"").trim(), email=String(b.email||"").trim().toLowerCase(), confirmEmail=String(b.confirmEmail||"").trim().toLowerCase(), phone=String(b.phone||"").trim(), password=String(b.password||"");
      if(!fullName||!username||!email||!confirmEmail||!phone||!password){send(res,400,{message:"Please fill all required fields."});return;}
      if(fullName.length<2){send(res,400,{message:"Enter a valid full name."});return;}
      if(!usernameOk(username)){send(res,400,{message:"Username must be 3-30 characters and use only letters, numbers, dot, underscore or hyphen."});return;}
      if(!emailOk(email)){send(res,400,{message:"Enter a valid email address."});return;}
      if(email!==confirmEmail){send(res,400,{message:"Email and confirm email do not match."});return;}
      if(!phoneOk(phone)){send(res,400,{message:"Phone number must contain exactly 10 digits."});return;}
      if(!passwordOk(password)){send(res,400,{message:"Password must be at least 6 characters."});return;}
      const age=Number(b.age);
      if(role==="voter"&&(!Number.isInteger(age)||age<18||age>120)){send(res,400,{message:"Only voters aged 18 or above are eligible to register."});return;}
      let electionId=null;
      if(role==="candidate"){
        electionId=id(b.electionId);
        if(!electionId||!String(b.partyName||"").trim()){send(res,400,{message:"Candidate registration needs an election and party name."});return;}
        const e=await cc.elections.findOne({_id:electionId}); if(!e){send(res,400,{message:"Selected election was not found."});return;}
      }
      const exists=await cc.users.findOne({$or:[{username},{email}]});
      if(exists){send(res,409,{message:exists.email===email?"This email is already registered. Please use another email.":"This username is already registered."});return;}
      const user={username,email,password:await bcrypt.hash(password,10),role,fullName,phone,address:String(b.address||"").trim(),age:role==="voter"?age:null,status:"active",emailValidated:true,createdAt:new Date(),updatedAt:new Date()};
      const r=await cc.users.insertOne(user); user._id=r.insertedId;
      if(role==="candidate"){
        await cc.candidates.insertOne({userId:user._id,electionId,partyName:String(b.partyName).trim(),partySymbol:String(b.partySymbol||"").trim(),partyColor:b.partyColor||"#6d5dfc",manifesto:String(b.manifesto||"").trim(),education:String(b.education||"").trim(),experience:String(b.experience||"").trim(),status:"pending",createdAt:new Date(),updatedAt:new Date()});
        await notify({targetRole:"admin",title:"New candidate approval request",message:`${fullName} registered as a candidate and is waiting for admin approval.`,type:"warning"});
        await audit(user._id.toString(),"Candidate registration","Candidate request submitted for admin approval");
        send(res,201,{message:"Candidate request submitted. You can login after an admin approves your profile."});return;
      }
      await notify({userId:user._id.toString(),title:"Welcome to VoteSphere",message:"Your voter account was created successfully. You are eligible to vote because you meet the 18+ age requirement.",type:"success"});
      await audit(user._id.toString(),"Voter registration","New voter registered");
      send(res,201,{token:tokenFor(user),user:publicUser(user)});return;
    }

    if(method==="POST"&&path==="/api/auth/login"){
      const b=await body(req), login=String(b.username||"").trim();
      const u=await cc.users.findOne({$or:[{username:login},{email:login.toLowerCase()}]});
      if(!u||!(await bcrypt.compare(String(b.password||""),u.password))){send(res,401,{message:"Invalid username/email or password."});return;}
      if(u.status==="blocked"){send(res,403,{message:"Your account is blocked by admin."});return;}
      if(u.role==="candidate"){
        const p=await cc.candidates.findOne({userId:u._id});
        if(!p||p.status!=="approved") { send(res,403,{message:p?.status==="rejected"?"Your candidate request was rejected by admin. Check notifications.":"Your candidate request is still waiting for admin approval."});return; }
      }
      await cc.users.updateOne({_id:u._id},{$set:{lastLogin:new Date()}}); await audit(u._id.toString(),"Login","User logged in");
      send(res,200,{token:tokenFor(u),user:publicUser(u)});return;
    }
    if(method==="GET"&&path==="/api/me"){
      const u=requireAuth(req,res);if(!u)return; const user=await cc.users.findOne({_id:id(u.id)},{projection:{password:0}}); if(!user){send(res,404,{message:"User not found."});return;} send(res,200,{user:publicUser(user)});return;
    }

    if(method==="GET"&&path==="/api/elections") {const list=await cc.elections.find().sort({startDate:1}).toArray();send(res,200,{elections:list.map(x=>({...x,id:x._id.toString()}))});return;}
    if(method==="GET"&&path==="/api/elections/active") {const now=new Date(); const list=await cc.elections.find({status:"active",startDate:{$lte:now},endDate:{$gte:now}}).sort({startDate:1}).toArray();send(res,200,{elections:list.map(x=>({...x,id:x._id.toString()}))});return;}
    if(method==="GET"&&path==="/api/candidates") {const eid=url.searchParams.get("electionId");const filter={status:"approved"};if(eid&&id(eid))filter.electionId=id(eid);const list=await cc.candidates.find(filter).sort({createdAt:-1}).toArray();send(res,200,{candidates:await Promise.all(list.map(candidateView))});return;}

    if(method==="POST"&&path==="/api/votes"){
      const u=requireAuth(req,res,["voter"]);if(!u)return;const b=await body(req),eid=id(b.electionId),cid=id(b.candidateId);if(!eid||!cid){send(res,400,{message:"Invalid election or candidate."});return;}
      const e=await cc.elections.findOne({_id:eid,status:"active",startDate:{$lte:new Date()},endDate:{$gte:new Date()}});if(!e){send(res,400,{message:"This election is not currently active."});return;}
      const cand=await cc.candidates.findOne({_id:cid,electionId:eid,status:"approved"});if(!cand){send(res,400,{message:"Candidate is not available for this election."});return;}
      const voterId=id(u.id);if(await cc.votes.findOne({voterId,electionId:eid})){send(res,409,{message:"You have already voted in this election."});return;}
      const voteHash=crypto.createHash("sha256").update(`${u.id}:${eid}:${cid}:${Date.now()}:${crypto.randomUUID()}`).digest("hex");
      try{await cc.votes.insertOne({voterId,electionId:eid,candidateId:cid,voteHash,createdAt:new Date()});await cc.elections.updateOne({_id:eid},{$inc:{totalVotes:1}});}catch(err){if(err.code===11000){send(res,409,{message:"You have already voted in this election."});return;}throw err;}
      await notify({userId:u.id,title:"Vote recorded",message:`Your vote for ${cand.partyName} in ${e.title} was recorded successfully.`,type:"success"});await audit(u.id,"Vote cast",`Election ${eid}`);
      send(res,201,{message:"Vote submitted successfully.",receiptHash:crypto.createHash("sha256").update(voteHash+":receipt").digest("hex")});return;
    }
    if(method==="GET"&&path==="/api/my-votes"){const u=requireAuth(req,res,["voter"]);if(!u)return;const list=await cc.votes.find({voterId:id(u.id)}).sort({createdAt:-1}).toArray();const out=[];for(const v of list){const e=await cc.elections.findOne({_id:v.electionId});const cand=await cc.candidates.findOne({_id:v.candidateId});const cu=cand?await cc.users.findOne({_id:cand.userId}):null;out.push({id:v._id.toString(),election:e?.title||"Election",candidate:cu?.fullName||"Candidate",date:v.createdAt,receiptHash:crypto.createHash("sha256").update(v.voteHash+":receipt").digest("hex")});}send(res,200,{votes:out});return;}
    if(method==="GET"&&path==="/api/results"){const eid=id(url.searchParams.get("electionId"));if(!eid){send(res,400,{message:"Election ID is required."});return;}const e=await cc.elections.findOne({_id:eid});if(!e){send(res,404,{message:"Election not found."});return;}const total=await cc.votes.countDocuments({electionId:eid});const cs=await cc.candidates.find({electionId:eid,status:"approved"}).toArray();const results=[];for(const x of cs){const u=await cc.users.findOne({_id:x.userId});const count=await cc.votes.countDocuments({electionId:eid,candidateId:x._id});results.push({candidateId:x._id.toString(),candidateName:u?.fullName||"Candidate",partyName:x.partyName,partyColor:x.partyColor,voteCount:count,percentage:total?Number((count*100/total).toFixed(2)):0});}results.sort((a,b)=>b.voteCount-a.voteCount);send(res,200,{election:{...e,id:e._id.toString()},totalVotes:total,results});return;}

    if(method==="GET"&&path==="/api/notifications"){const u=requireAuth(req,res);if(!u)return;const uid=id(u.id);const list=await cc.notifications.find({$or:[{userId:uid},{userId:null,targetRole:"all"},{userId:null,targetRole:u.role}],}).sort({createdAt:-1}).limit(50).toArray();send(res,200,{notifications:list.map(n=>({...n,id:n._id.toString(),read:Array.isArray(n.readBy)&&n.readBy.some(x=>x.toString()===u.id)}))});return;}
    if(method==="PUT"&&path.startsWith("/api/notifications/")){const u=requireAuth(req,res);if(!u)return;const nid=id(path.split("/").pop());if(!nid){send(res,400,{message:"Invalid notification."});return;}await cc.notifications.updateOne({_id:nid},{$addToSet:{readBy:id(u.id)}});send(res,200,{message:"Notification marked as read."});return;}

    if(method==="GET"&&path==="/api/admin/stats"){const u=requireAuth(req,res,["admin"]);if(!u)return;const pending=await cc.candidates.countDocuments({status:"pending"});const [voters,candidates,elections,votes]=await Promise.all([cc.users.countDocuments({role:"voter"}),cc.candidates.countDocuments(),cc.elections.countDocuments(),cc.votes.countDocuments()]);send(res,200,{stats:{voters,candidates,elections,votes,pendingCandidates:pending}});return;}
    if(method==="GET"&&path==="/api/admin/voters"){const u=requireAuth(req,res,["admin"]);if(!u)return;const s=String(url.searchParams.get("search")||"").trim(),pattern=escapeRegex(s);const filter={role:"voter"};if(s)filter.$or=[{fullName:{$regex:pattern,$options:"i"}},{username:{$regex:pattern,$options:"i"}},{email:{$regex:pattern,$options:"i"}},{phone:{$regex:pattern,$options:"i"}}];const list=await cc.users.find(filter,{projection:{password:0}}).sort({createdAt:-1}).toArray();send(res,200,{voters:list.map(publicUser)});return;}
    if(method==="PUT"&&path.startsWith("/api/admin/voters/")){const u=requireAuth(req,res,["admin"]);if(!u)return;const vid=id(path.split("/").pop()),b=await body(req);if(!vid){send(res,400,{message:"Invalid voter."});return;}const update={};if(typeof b.fullName==="string"&&b.fullName.trim())update.fullName=b.fullName.trim();if(typeof b.phone==="string"){if(!phoneOk(b.phone)){send(res,400,{message:"Phone number must contain exactly 10 digits."});return;}update.phone=b.phone;}if(Number.isInteger(Number(b.age))){if(Number(b.age)<18){send(res,400,{message:"Voter must remain 18+."});return;}update.age=Number(b.age);}if(["active","blocked"].includes(b.status))update.status=b.status;await cc.users.updateOne({_id:vid,role:"voter"},{$set:{...update,updatedAt:new Date()}});await audit(u.id,"Update voter",vid.toString());send(res,200,{message:"Voter updated."});return;}
    if(method==="DELETE"&&path.startsWith("/api/admin/voters/")){const u=requireAuth(req,res,["admin"]);if(!u)return;const vid=id(path.split("/").pop());if(!vid){send(res,400,{message:"Invalid voter."});return;}await cc.votes.deleteMany({voterId:vid});await cc.notifications.deleteMany({userId:vid});await cc.users.deleteOne({_id:vid,role:"voter"});send(res,200,{message:"Voter deleted."});return;}

    if(method==="GET"&&path==="/api/admin/candidates"){const u=requireAuth(req,res,["admin"]);if(!u)return;const s=String(url.searchParams.get("search")||"").trim().toLowerCase();const list=await cc.candidates.find().sort({createdAt:-1}).toArray();let out=await Promise.all(list.map(candidateView));if(s)out=out.filter(x=>`${x.fullName} ${x.username} ${x.email} ${x.partyName} ${x.electionTitle} ${x.status}`.toLowerCase().includes(s));send(res,200,{candidates:out});return;}
    if(method==="POST"&&path==="/api/admin/candidates"){const u=requireAuth(req,res,["admin"]);if(!u)return;const b=await body(req),username=String(b.username||"").trim(),email=String(b.email||`${username}@voting.local`).trim().toLowerCase();if(!b.fullName||!username||!passwordOk(String(b.password||""))||!b.partyName||!id(b.electionId)){send(res,400,{message:"Name, username, password, party and election are required."});return;}if(await cc.users.findOne({$or:[{username},{email}]})){send(res,409,{message:"Username or email already exists."});return;}const user={username,email,password:await bcrypt.hash(String(b.password),10),role:"candidate",fullName:String(b.fullName).trim(),phone:String(b.phone||""),status:"active",emailValidated:true,createdAt:new Date(),updatedAt:new Date()};const ur=await cc.users.insertOne(user);await cc.candidates.insertOne({userId:ur.insertedId,electionId:id(b.electionId),partyName:String(b.partyName).trim(),partySymbol:String(b.partySymbol||""),partyColor:b.partyColor||"#6d5dfc",manifesto:String(b.manifesto||""),education:String(b.education||""),experience:String(b.experience||""),status:b.status||"approved",createdAt:new Date(),updatedAt:new Date()});await notify({userId:ur.insertedId.toString(),title:"Candidate profile created",message:"An admin created your candidate profile.",type:"info"});send(res,201,{message:"Candidate created."});return;}
    if(method==="PUT"&&path.startsWith("/api/admin/candidates/")){const u=requireAuth(req,res,["admin"]);if(!u)return;const cid=id(path.split("/").pop()),b=await body(req);if(!cid){send(res,400,{message:"Invalid candidate."});return;}const cand=await cc.candidates.findOne({_id:cid});if(!cand){send(res,404,{message:"Candidate not found."});return;}const update={};for(const k of ["partyName","partySymbol","partyColor","manifesto","education","experience"])if(b[k]!==undefined)update[k]=b[k];if(b.electionId){const eid=id(b.electionId);if(!eid){send(res,400,{message:"Invalid election."});return;}update.electionId=eid;}if(["approved","pending","rejected"].includes(b.status))update.status=b.status;await cc.candidates.updateOne({_id:cid},{$set:{...update,updatedAt:new Date()}});if(typeof b.fullName==="string"&&b.fullName.trim())await cc.users.updateOne({_id:cand.userId},{$set:{fullName:b.fullName.trim(),updatedAt:new Date()}});if(update.status){const msg=update.status==="approved"?"Your candidate request was approved. You can now login.":update.status==="rejected"?"Your candidate request was rejected by admin. Contact admin for clarification.":"Your candidate status was changed to pending.";await notify({userId:cand.userId.toString(),title:`Candidate status: ${update.status}`,message:msg,type:update.status==="approved"?"success":update.status==="rejected"?"warning":"info"});}send(res,200,{message:"Candidate updated."});return;}
    if(method==="DELETE"&&path.startsWith("/api/admin/candidates/")){const u=requireAuth(req,res,["admin"]);if(!u)return;const cid=id(path.split("/").pop());const cand=cid?await cc.candidates.findOne({_id:cid}):null;if(!cand){send(res,404,{message:"Candidate not found."});return;}await cc.votes.deleteMany({candidateId:cid});await cc.candidates.deleteOne({_id:cid});await cc.notifications.deleteMany({userId:cand.userId});await cc.users.deleteOne({_id:cand.userId});send(res,200,{message:"Candidate deleted."});return;}

    if(method==="POST"&&path==="/api/admin/elections"){const u=requireAuth(req,res,["admin"]);if(!u)return;const b=await body(req);if(!b.title||!b.startDate||!b.endDate){send(res,400,{message:"Title, start date and end date are required."});return;}const start=new Date(b.startDate),end=new Date(b.endDate);if(!(start<end)){send(res,400,{message:"End date must be after start date."});return;}await cc.elections.insertOne({title:String(b.title).trim(),description:String(b.description||""),electionType:b.electionType||"General",startDate:start,endDate:end,status:b.status||"upcoming",totalVotes:0,createdBy:id(u.id),createdAt:new Date(),updatedAt:new Date()});send(res,201,{message:"Election created."});return;}
    if(method==="PUT"&&path.startsWith("/api/admin/elections/")){const u=requireAuth(req,res,["admin"]);if(!u)return;const eid=id(path.split("/").pop()),b=await body(req);if(!eid){send(res,400,{message:"Invalid election."});return;}const update={};for(const k of ["title","description","electionType","status"])if(b[k]!==undefined)update[k]=b[k];if(b.startDate)update.startDate=new Date(b.startDate);if(b.endDate)update.endDate=new Date(b.endDate);if(update.startDate&&update.endDate&&update.startDate>=update.endDate){send(res,400,{message:"End date must be after start date."});return;}await cc.elections.updateOne({_id:eid},{$set:{...update,updatedAt:new Date()}});send(res,200,{message:"Election updated."});return;}
    if(method==="DELETE"&&path.startsWith("/api/admin/elections/")){const u=requireAuth(req,res,["admin"]);if(!u)return;const eid=id(path.split("/").pop());if(!eid){send(res,400,{message:"Invalid election."});return;}const cand=await cc.candidates.find({electionId:eid}).toArray();for(const x of cand)await cc.users.deleteOne({_id:x.userId});await cc.candidates.deleteMany({electionId:eid});await cc.votes.deleteMany({electionId:eid});await cc.elections.deleteOne({_id:eid});send(res,200,{message:"Election deleted."});return;}

    if(method==="GET"&&path==="/api/admin/votes"){const u=requireAuth(req,res,["admin"]);if(!u)return;const s=String(url.searchParams.get("search")||"").toLowerCase();const list=await cc.votes.find().sort({createdAt:-1}).toArray();const out=[];for(const v of list){const voter=await cc.users.findOne({_id:v.voterId});const e=await cc.elections.findOne({_id:v.electionId});const cand=await cc.candidates.findOne({_id:v.candidateId});const cu=cand?await cc.users.findOne({_id:cand.userId}):null;out.push({id:v._id.toString(),voter:voter?.fullName||"Deleted voter",username:voter?.username||"",election:e?.title||"Deleted election",candidate:cu?.fullName||"Deleted candidate",date:v.createdAt,receiptHash:crypto.createHash("sha256").update(v.voteHash+":receipt").digest("hex")});}const filtered=s?out.filter(x=>`${x.voter} ${x.username} ${x.election} ${x.candidate}`.toLowerCase().includes(s)):out;send(res,200,{votes:filtered});return;}

    if(method==="POST"&&path==="/api/admin/notifications"){const u=requireAuth(req,res,["admin"]);if(!u)return;const b=await body(req);if(!String(b.title||"").trim()||!String(b.message||"").trim()){send(res,400,{message:"Title and message are required."});return;}const target=["all","voter","candidate"].includes(b.targetRole)?b.targetRole:"all";await notify({targetRole:target,title:String(b.title).trim(),message:String(b.message).trim(),type:b.type||"info"});send(res,201,{message:"Notification sent."});return;}
    if(method==="GET"&&path==="/api/admin/audit"){const u=requireAuth(req,res,["admin"]);if(!u)return;const list=await cc.audit.find().sort({createdAt:-1}).limit(100).toArray();send(res,200,{logs:list.map(x=>({...x,id:x._id.toString(),userId:x.userId?.toString()||null}))});return;}

    send(res,404,{message:"Route not found."});
  } catch(err){console.error(err);send(res,500,{message:err.message||"Server error"});}
}

async function start(){await client.connect();db=client.db(DB_NAME);const ccx=c();await Promise.all([
  ccx.users.createIndex({username:1},{unique:true}),ccx.users.createIndex({email:1},{unique:true}),ccx.votes.createIndex({voterId:1,electionId:1},{unique:true}),ccx.notifications.createIndex({createdAt:-1})
]);http.createServer(route).listen(PORT,()=>console.log(`VoteSphere backend: http://localhost:${PORT}`));}
start().catch(e=>{console.error("Backend startup failed:",e);process.exit(1);});
