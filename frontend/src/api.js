const BASE=import.meta.env.VITE_API_URL||"http://localhost:5000/api";
export async function api(path,options={}){
 const headers={"Content-Type":"application/json",...(options.headers||{})};
 const token=localStorage.getItem("ovs_token"); if(token) headers.Authorization=`Bearer ${token}`;
 const res=await fetch(`${BASE}${path}`,{...options,headers});
 let data={}; try{data=await res.json()}catch{}
 if(!res.ok){if(res.status===401&&path!=="/auth/login"){localStorage.removeItem("ovs_token")}throw new Error(data.message||"Something went wrong.")}
 return data;
}
