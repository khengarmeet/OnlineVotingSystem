import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
const uri=process.env.MONGO_URI||"mongodb://127.0.0.1:27017";
const dbName=process.env.DB_NAME||"online_voting_system";
const client=new MongoClient(uri);
const hash=p=>bcrypt.hash(p,10);
async function run(){
 await client.connect();const db=client.db(dbName);const users=db.collection("users"),elections=db.collection("elections"),candidates=db.collection("candidates"),notifications=db.collection("notifications");
 async function makeUser(data,password){let u=await users.findOne({username:data.username});if(u)return u;const doc={...data,password:await hash(password),createdAt:new Date(),updatedAt:new Date()};const r=await users.insertOne(doc);doc._id=r.insertedId;return doc;}
 const admin=await makeUser({username:"admin",email:"admin@votesphere.local",role:"admin",fullName:"System Administrator",status:"active",emailValidated:true},"admin123");
 const voter=await makeUser({username:"voter1",email:"voter1@votesphere.local",role:"voter",fullName:"Raj Kumar",phone:"9876543210",age:25,status:"active",emailValidated:true},"voter123");
 const candidateUser=await makeUser({username:"candidate1",email:"candidate1@votesphere.local",role:"candidate",fullName:"Aarav Sharma",phone:"9876500001",status:"active",emailValidated:true},"candidate123");
 let election=await elections.findOne({title:"General Election 2026"});
 if(!election){const now=new Date();const end=new Date(now.getTime()+30*86400000);const r=await elections.insertOne({title:"General Election 2026",description:"Demo election for the academic Online Voting System.",electionType:"General",startDate:now,endDate:end,status:"active",totalVotes:0,createdBy:admin._id,createdAt:new Date(),updatedAt:new Date()});election={_id:r.insertedId};}
 if(!(await candidates.findOne({userId:candidateUser._id,electionId:election._id}))){await candidates.insertOne({userId:candidateUser._id,electionId:election._id,partyName:"Digital Future Party",partySymbol:"DF",partyColor:"#6d5dfc",manifesto:"Student-focused digital services and transparent administration.",education:"BCA",experience:"Community volunteer",status:"approved",createdAt:new Date(),updatedAt:new Date()});}
 const second=await makeUser({username:"candidate2",email:"candidate2@votesphere.local",role:"candidate",fullName:"Diya Patel",phone:"9876500002",status:"active",emailValidated:true},"candidate123");
 if(!(await candidates.findOne({userId:second._id,electionId:election._id}))){await candidates.insertOne({userId:second._id,electionId:election._id,partyName:"Tech Progress Group",partySymbol:"TP",partyColor:"#10b981",manifesto:"Technology, accessibility and transparent services.",education:"BCA",experience:"Student representative",status:"approved",createdAt:new Date(),updatedAt:new Date()});}
 if(!(await notifications.findOne({title:"Welcome to VoteSphere"}))){await notifications.insertOne({userId:null,targetRole:"all",title:"Welcome to VoteSphere",message:"Admin can send announcements. Candidate accounts need approval before login.",type:"info",readBy:[],createdAt:new Date()});}
 console.log("Seed complete");console.log("Admin: admin / admin123");console.log("Voter: voter1 / voter123");console.log("Candidate: candidate1 / candidate123");await client.close();
}
run().catch(e=>{console.error(e);process.exit(1);});
