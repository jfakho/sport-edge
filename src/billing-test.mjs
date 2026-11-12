/**
 * COTEGO Plus — TEST ONLY. Requires D1 and Stripe test secrets.
 * Explicitly refuses live Stripe keys and production hostnames.
 */
const enc=new TextEncoder();
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const error=(message,status)=>json({ok:false,error:message},status);
const hex=buf=>Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,"0")).join("");
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async v=>hex(await crypto.subtle.digest("SHA-256",enc.encode(v)));
const cookieName="__Host-cotego_session";
const cookie=(token,maxAge)=>cookieName+"="+token+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge;
const getCookie=r=>(r.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName+"="))?.slice(cookieName.length+1)||"";
const isPreview=r=>{const u=new URL(r.url);return u.protocol==="https:"&&u.hostname.endsWith("-cotego.salama-jimmy.workers.dev");};
const validEmail=x=>typeof x==="string"&&x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
const readJSON=async r=>{const s=await r.text();if(s.length>16384)throw Error("too large");return JSON.parse(s);};
async function passwordHash(password,salt,rounds=190000){
 const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
 return hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:rounds,hash:"SHA-256"},key,256));
}
async function issueSession(db,userId){
 const token=random();await db.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await digest(token),userId,Date.now()+1209600000).run();return token;
}
async function currentUser(r,db){
 const token=getCookie(r);if(!/^[a-f0-9]{64}$/.test(token))return null;
 return db.prepare("SELECT users.id,users.email,users.stripe_customer_id FROM sessions JOIN users ON sessions.user_id=users.id WHERE sessions.token_hash=? AND sessions.expires_at>?").bind(await digest(token),Date.now()).first();
}
async function stripeRequest(path,fields,secret){
 const body=new URLSearchParams();
 for(const [name,value] of Object.entries(fields))if(value!==undefined&&value!==null)body.append(name,String(value));
 const response=await fetch("https://api.stripe.com/v1/"+path,{method:"POST",headers:{"Authorization":"Bearer "+secret,"Content-Type":"application/x-www-form-urlencoded"},body});
 if(!response.ok)throw Error("Stripe test request failed");
 const obj=await response.json();if(typeof obj.url!=="string"||!/^https:\/\/(checkout|billing)\.stripe\.com\//.test(obj.url))throw Error("Unexpected Stripe URL");
 return obj.url;
}
export async function verifyStripeSignature(raw,header,secret,now=Date.now()){
 if(!secret?.startsWith("whsec_")||typeof header!=="string")return false;
 const components=header.split(",").map(x=>x.trim().split("="));
 const stamp=components.find(x=>x[0]==="t")?.[1];
 const candidates=components.filter(x=>x[0]==="v1").map(x=>x[1]);
 if(!/^\d{9,12}$/.test(stamp||"")||Math.abs(Number(stamp)*1000-now)>300000)return false;
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const expected=hex(await crypto.subtle.sign("HMAC",key,enc.encode(stamp+"."+raw)));
 for(const candidate of candidates){
   if(!/^[a-f0-9]{64}$/i.test(candidate||""))continue;
   let delta=0;const lowercase=candidate.toLowerCase();
   for(let i=0;i<64;i++)delta|=expected.charCodeAt(i)^lowercase.charCodeAt(i);
   if(delta===0)return true;
 }
 return false;
}
async function webhook(r,env){
 const raw=await r.text();if(raw.length>1048576)return error("Payload too large",413);
 if(!await verifyStripeSignature(raw,r.headers.get("stripe-signature"),env.STRIPE_TEST_WEBHOOK_SECRET))return error("Invalid signature",400);
 let event;try{event=JSON.parse(raw);}catch{return error("Invalid event",400);}
 if(event.livemode!==false||!/^evt_/.test(event.id||""))return error("Live event rejected",400);
 const existing=await env.COTEGO_DB.prepare("SELECT event_id FROM billing_events WHERE event_id=?").bind(event.id).first();
 if(existing)return json({ok:true,duplicate:true});
 const obj=event.data?.object||{};
 if(event.type==="checkout.session.completed"){
   const user=String(obj.client_reference_id||"");
   if(user&&typeof obj.customer==="string"){
     await env.COTEGO_DB.prepare("UPDATE users SET stripe_customer_id=? WHERE id=? AND (stripe_customer_id IS NULL OR stripe_customer_id=?)").bind(obj.customer,user,obj.customer).run();
   }
 }else if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
   const user=String(obj.metadata?.user_id||""),customer=String(obj.customer||""),sid=String(obj.id||"");
   if(user&&customer.startsWith("cus_")&&sid.startsWith("sub_")){
     const owner=await env.COTEGO_DB.prepare("SELECT id,stripe_customer_id FROM users WHERE id=?").bind(user).first();
     if(owner&&(!owner.stripe_customer_id||owner.stripe_customer_id===customer)){
       await env.COTEGO_DB.prepare("UPDATE users SET stripe_customer_id=? WHERE id=? AND stripe_customer_id IS NULL").bind(customer,user).run();
       const status=event.type==="customer.subscription.deleted"?"canceled":String(obj.status||"incomplete");
       const period=Number(obj.current_period_end||obj.items?.data?.[0]?.current_period_end||0);
       await env.COTEGO_DB.prepare("INSERT INTO subscriptions(user_id,customer_id,subscription_id,status,period_end,last_event_created) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,status=excluded.status,period_end=excluded.period_end,last_event_created=excluded.last_event_created WHERE excluded.last_event_created>=subscriptions.last_event_created").bind(user,customer,sid,status,period,Number(event.created)||0).run();
     }
   }
 }
 // Record as processed only after all entitlement changes succeeded.
 await env.COTEGO_DB.prepare("INSERT OR IGNORE INTO billing_events (event_id,created_at) VALUES (?,?)").bind(event.id,event.created||0).run();
 return json({ok:true});
}
export async function handleBillingTest(r,env){
 const url=new URL(r.url),path=url.pathname;
 if(!isPreview(r))return error("Test not available on production",404);
 if(path==="/api/billing/webhook"&&r.method==="POST"){
   if(!env.COTEGO_DB||!env.STRIPE_TEST_WEBHOOK_SECRET)return error("Test webhook not configured",503);
   return webhook(r,env);
 }
 if(r.method!=="GET"&&r.headers.get("origin")!==url.origin)return error("Origin forbidden",403);
 if(!env.COTEGO_DB)return error("Test database not configured",503);
 if(path==="/api/account/signup"&&r.method==="POST"){
   let v;try{v=await readJSON(r);}catch{return error("Invalid request",400);}
   const email=String(v.email||"").trim().toLowerCase(),password=v.password;
   if(!validEmail(email)||typeof password!=="string"||password.length<12||password.length>128)return error("Invalid email or password",400);
   const salt=random(),id=crypto.randomUUID(),hashed=await passwordHash(password,salt);
   try{await env.COTEGO_DB.prepare("INSERT INTO users (id,email,password_salt,password_hash,iterations,created_at) VALUES (?,?,?,?,?,?)").bind(id,email,salt,hashed,190000,Date.now()).run();}
   catch{return error("Unable to create account",409);}
   return json({ok:true,email},201,{"set-cookie":cookie(await issueSession(env.COTEGO_DB,id),1209600)});
 }
 if(path==="/api/account/login"&&r.method==="POST"){
   let v;try{v=await readJSON(r);}catch{return error("Invalid request",400);}
   const email=String(v.email||"").trim().toLowerCase(),password=String(v.password||"");
   if(!validEmail(email)||password.length>128)return error("Invalid credentials",401);
   const limit=await env.COTEGO_DB.prepare("SELECT attempts,window_start FROM login_limits WHERE email=?").bind(email).first();
   if(limit&&Date.now()-limit.window_start<900000&&limit.attempts>=6)return error("Too many attempts",429);
   const user=await env.COTEGO_DB.prepare("SELECT id,email,password_salt,password_hash,iterations FROM users WHERE email=?").bind(email).first();
   if(!user||!password||await passwordHash(password,user.password_salt,user.iterations)!==user.password_hash){
     await env.COTEGO_DB.prepare("INSERT INTO login_limits(email,attempts,window_start) VALUES (?,1,?) ON CONFLICT(email) DO UPDATE SET attempts=CASE WHEN excluded.window_start-login_limits.window_start>900000 THEN 1 ELSE login_limits.attempts+1 END,window_start=CASE WHEN excluded.window_start-login_limits.window_start>900000 THEN excluded.window_start ELSE login_limits.window_start END").bind(email,Date.now()).run();
     return error("Invalid credentials",401);
   }
   await env.COTEGO_DB.prepare("DELETE FROM login_limits WHERE email=?").bind(email).run();
   return json({ok:true,email},200,{"set-cookie":cookie(await issueSession(env.COTEGO_DB,user.id),1209600)});
 }
 if(path==="/api/account/logout"&&r.method==="POST"){
   const token=getCookie(r);if(token)await env.COTEGO_DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(token)).run();
   return json({ok:true},200,{"set-cookie":cookie("",0)});
 }
 const user=await currentUser(r,env.COTEGO_DB);
 if(!user)return error("Sign in required",401);
 if(path==="/api/account/me"&&r.method==="GET"){
   const sub=await env.COTEGO_DB.prepare("SELECT status,period_end FROM subscriptions WHERE user_id=?").bind(user.id).first();
   const isPlus=sub?.status==="active"&&Number(sub.period_end)>0&&Number(sub.period_end)*1000>Date.now();
   return json({ok:true,email:user.email,plan:isPlus?"plus":"free",subscriptionStatus:sub?.status||null});
 }
 if(path==="/api/billing/checkout"&&r.method==="POST"){
   if(!env.STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_")||!env.STRIPE_TEST_PRICE_ID?.startsWith("price_"))return error("Stripe test not configured",503);
   try{
     const base=url.origin;
     const params={mode:"subscription","line_items[0][price]":env.STRIPE_TEST_PRICE_ID,"line_items[0][quantity]":1,client_reference_id:user.id,"metadata[user_id]":user.id,"subscription_data[metadata][user_id]":user.id,success_url:base+"/?billing=success",cancel_url:base+"/?billing=cancel"};
     if(user.stripe_customer_id)params.customer=user.stripe_customer_id;else params.customer_email=user.email;
     return json({ok:true,url:await stripeRequest("checkout/sessions",params,env.STRIPE_TEST_SECRET_KEY)});
   }catch{return error("Stripe test checkout failed",502);}
 }
 if(path==="/api/billing/portal"&&r.method==="POST"){
   if(!env.STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_")||!user.stripe_customer_id)return error("Test portal not configured",503);
   try{return json({ok:true,url:await stripeRequest("billing_portal/sessions",{customer:user.stripe_customer_id,return_url:url.origin+"/"},env.STRIPE_TEST_SECRET_KEY)});}
   catch{return error("Stripe test portal failed",502);}
 }
 return error("Not found",404);
}
