import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const cfg = window.DBP_FIREBASE_CONFIG || {};
const configured = cfg.apiKey && cfg.projectId && !String(cfg.apiKey).includes("PASTE_") && !String(cfg.projectId).includes("PASTE_");

const state = {
  user: null,
  auth: null,
  db: null,
  ready: false,
  pendingKey: "dbp_pendingAttempts_v1"
};

const css = `
#dbpAuthShield{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(8,15,27,.58);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:1;transition:opacity .2s ease}
#dbpAuthShield.dbp-auth-hidden{opacity:0;pointer-events:none}
#dbpAuthCard{width:min(430px,100%);background:var(--surface,#fff);color:var(--ink,#17233f);border:1px solid var(--line,#e3e9ea);border-radius:24px;padding:28px;box-shadow:0 28px 90px rgba(0,0,0,.28);font-family:var(--sans,Inter,system-ui,-apple-system,"Segoe UI",sans-serif)}
.dbp-auth-logo{width:52px;height:52px;border-radius:15px;background:linear-gradient(145deg,#f7d990,#b8892b);display:grid;place-items:center;color:#10283e;font-family:Georgia,serif;font-weight:800;font-size:19px;letter-spacing:-2px;box-shadow:0 9px 22px rgba(0,0,0,.15);margin-bottom:20px}
.dbp-auth-kicker{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold,#b8892b);margin-bottom:9px}
.dbp-auth-title{margin:0;font-family:var(--serif,Fraunces,Georgia,serif);font-size:29px;line-height:1.08;letter-spacing:-.02em}
.dbp-auth-copy{margin:11px 0 20px;color:var(--muted,#71808b);font-size:13.5px;line-height:1.65}
.dbp-google-btn{width:100%;border:1px solid var(--line,#e3e9ea);background:var(--surface2,#fbfcfc);color:var(--ink,#17233f);border-radius:13px;padding:13px 16px;display:flex;align-items:center;justify-content:center;gap:11px;font-size:14px;font-weight:800;cursor:pointer;transition:.18s ease}
.dbp-google-btn:hover{transform:translateY(-1px);border-color:var(--teal,#178f8c);background:var(--tealbg,#eaf7f5)}
.dbp-google-btn:disabled{opacity:.55;cursor:wait;transform:none}
.dbp-google-g{width:20px;height:20px;display:block}
.dbp-auth-note{margin:13px 0 0;color:var(--faint,#9aa5ae);font-size:10.5px;line-height:1.55;text-align:center}
.dbp-auth-error{display:none;margin:13px 0 0;padding:10px 12px;border-radius:10px;background:var(--redbg,#fbeaea);color:var(--red,#ad2b22);font-size:11.5px;line-height:1.5}
.dbp-auth-error.show{display:block}
#dbpAuthMini{position:fixed;right:14px;bottom:12px;z-index:2147482000;display:none;align-items:center;gap:7px;padding:7px 9px;border:1px solid var(--line,#e3e9ea);background:color-mix(in srgb,var(--surface,#fff) 94%,transparent);color:var(--muted,#71808b);border-radius:999px;font:700 10.5px/1 var(--sans,Inter,system-ui,sans-serif);box-shadow:0 6px 18px rgba(20,35,50,.08);backdrop-filter:blur(8px)}
#dbpAuthMini button{border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
@media(max-width:560px){#dbpAuthCard{padding:24px 20px;border-radius:21px}.dbp-auth-title{font-size:25px}#dbpAuthMini{right:10px;bottom:10px}}
`;

function ensureStyles(){
  if(document.getElementById("dbpAuthStyle")) return;
  const s=document.createElement("style");
  s.id="dbpAuthStyle";s.textContent=css;document.head.appendChild(s);
}

function googleIcon(){
  return `<svg class="dbp-google-g" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.39l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6.01 6.01 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.48H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.52l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.5l2.86-2.86A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.35 2.59C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>`;
}

function makeShield(mode="loading"){
  ensureStyles();
  let shield=document.getElementById("dbpAuthShield");
  if(!shield){
    shield=document.createElement("div");
    shield.id="dbpAuthShield";
    shield.innerHTML=`<div id="dbpAuthCard" role="dialog" aria-modal="true" aria-labelledby="dbpAuthTitle"></div>`;
    document.body.appendChild(shield);
  }
  const card=document.getElementById("dbpAuthCard");
  if(mode==="loading"){
    card.innerHTML=`<div class="dbp-auth-logo">MB</div><div class="dbp-auth-kicker">DR BADAWY ACADEMY</div><h2 class="dbp-auth-title" id="dbpAuthTitle">Preparing your quiz…</h2><p class="dbp-auth-copy">One moment.</p>`;
  }else{
    card.innerHTML=`<div class="dbp-auth-logo">MB</div><div class="dbp-auth-kicker">DR BADAWY ACADEMY</div><h2 class="dbp-auth-title" id="dbpAuthTitle">Continue to your quiz.</h2><p class="dbp-auth-copy">Sign in once with Google to save your quiz progress and results across devices.</p><button class="dbp-google-btn" id="dbpGoogleBtn">${googleIcon()}<span>Continue with Google</span></button><div class="dbp-auth-error" id="dbpAuthError"></div><p class="dbp-auth-note">Your Google name and email are used only to identify your learning progress. You can sign out anytime.</p>`;
    document.getElementById("dbpGoogleBtn").addEventListener("click", startGoogleSignIn);
  }
  return shield;
}

function hideShield(){
  const s=document.getElementById("dbpAuthShield");
  if(!s) return;
  s.classList.add("dbp-auth-hidden");
  setTimeout(()=>s.remove(),220);
}

function showError(message){
  const box=document.getElementById("dbpAuthError");
  if(box){box.textContent=message;box.classList.add("show")}
}

function setButtonBusy(busy){
  const b=document.getElementById("dbpGoogleBtn");
  if(!b) return;
  b.disabled=busy;
  const span=b.querySelector("span");
  if(span) span.textContent=busy?"Connecting…":"Continue with Google";
}

function friendlyAuthError(error){
  if(!error) return "Couldn’t sign you in. Please try again.";
  if(error.code==="auth/popup-closed-by-user") return "Sign-in was closed before completion. Try again when you’re ready.";
  if(error.code==="auth/network-request-failed") return "Check your internet connection, then try again.";
  if(error.code==="auth/unauthorized-domain") return "Sign-in is temporarily unavailable on this domain.";
  return "Couldn’t sign you in. Please try again.";
}

function isMobile(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)}

async function startGoogleSignIn(){
  if(!state.auth) return;
  setButtonBusy(true);
  const provider=new GoogleAuthProvider();
  try{
    if(isMobile()){
      await signInWithRedirect(state.auth,provider);
      return;
    }
    await signInWithPopup(state.auth,provider);
  }catch(error){
    if(error?.code==="auth/popup-blocked" || error?.code==="auth/cancelled-popup-request"){
      try{await signInWithRedirect(state.auth,provider);return}catch(e){error=e}
    }
    showError(friendlyAuthError(error));
    setButtonBusy(false);
  }
}

function pending(){
  try{return JSON.parse(localStorage.getItem(state.pendingKey)||"[]")}catch{return []}
}
function savePending(items){
  try{localStorage.setItem(state.pendingKey,JSON.stringify(items.slice(-30)))}catch{}
}
function queueAttempt(data){
  const items=pending();
  items.push({...data,queuedAt:new Date().toISOString()});
  savePending(items);
  flushPending();
}

async function writeAttempt(data){
  if(!state.user || !state.db) throw new Error("not-authenticated");
  const uid=state.user.uid;
  const score=Number(data.score)||0;
  const total=Math.max(1,Number(data.total)||1);
  const pct=Math.round((score/total)*100);
  await addDoc(collection(state.db,"students",uid,"attempts"),{
    uid,
    quizId:String(data.quizId||quizIdFromPath()),
    sectionId:Number.isFinite(Number(data.sectionId))?Number(data.sectionId):0,
    title:String(data.title||document.title||"Quiz").slice(0,180),
    score,
    total,
    pct,
    path:location.pathname,
    clientCompletedAt:new Date().toISOString(),
    completedAt:serverTimestamp()
  });
}

async function flushPending(){
  if(!state.user || !state.db || !navigator.onLine) return;
  const items=pending();
  if(!items.length) return;
  const remaining=[];
  for(const item of items){
    try{await writeAttempt(item)}catch{remaining.push(item)}
  }
  savePending(remaining);
}

function quizIdFromPath(){
  const file=(location.pathname.split("/").pop()||"quiz").replace(/\.html?$/i,"");
  return file || "quiz";
}

function hookQuizProgress(){
  let tries=0;
  const t=setInterval(()=>{
    tries++;
    if(typeof window.saveQuizProgress==="function" && !window.saveQuizProgress.__dbpWrapped){
      const original=window.saveQuizProgress;
      const wrapped=function(sectionIdx,score,total){
        const result=original.apply(this,arguments);
        queueAttempt({quizId:quizIdFromPath(),sectionId:sectionIdx,score,total,title:document.title});
        return result;
      };
      wrapped.__dbpWrapped=true;
      window.saveQuizProgress=wrapped;
      clearInterval(t);
    }else if(tries>120){clearInterval(t)}
  },100);
}

function addMiniAccount(){
  if(document.getElementById("dbpAuthMini")) return;
  const m=document.createElement("div");
  m.id="dbpAuthMini";
  m.innerHTML=`<span>✓ Progress sync on</span><span>·</span><button type="button" id="dbpSignOut">Sign out</button>`;
  document.body.appendChild(m);
  m.style.display="flex";
  document.getElementById("dbpSignOut").addEventListener("click",async()=>{
    await signOut(state.auth);
    location.reload();
  });
}

async function syncProfile(user){
  if(!state.db || !user) return;
  const provider=user.providerData?.[0]?.providerId||"google.com";
  await setDoc(doc(state.db,"students",user.uid),{
    uid:user.uid,
    name:user.displayName||"",
    email:user.email||"",
    photoUrl:user.photoURL||"",
    provider,
    lastSeenAt:serverTimestamp()
  },{merge:true});
}

async function boot(){
  makeShield("loading");
  if(!configured){
    makeShield("signin");
    const b=document.getElementById("dbpGoogleBtn");
    if(b) b.disabled=true;
    showError("Sign-in is not configured yet.");
    return;
  }
  const app=getApps().length?getApps()[0]:initializeApp(cfg);
  state.auth=getAuth(app);
  state.db=getFirestore(app);
  try{await setPersistence(state.auth,browserLocalPersistence)}catch{}
  try{await getRedirectResult(state.auth)}catch(error){console.warn("DBP auth redirect",error?.code||error)}

  const user=await new Promise(resolve=>{
    const off=onAuthStateChanged(state.auth,u=>{off();resolve(u)});
  });
  state.user=user;
  state.ready=true;

  if(user){
    hideShield();
    addMiniAccount();
    hookQuizProgress();
    try{await syncProfile(user)}catch(error){console.warn("DBP profile sync",error)}
    flushPending();
  }else{
    makeShield("signin");
  }

  onAuthStateChanged(state.auth,async u=>{
    state.user=u;
    if(u){
      hideShield();addMiniAccount();hookQuizProgress();
      try{await syncProfile(u)}catch{}
      flushPending();
    }
  });
  addEventListener("online",flushPending);
}

window.DBPAuth={
  getUser:()=>state.user,
  recordQuizResult:(data)=>queueAttempt(data||{}),
  signOut:()=>state.auth?signOut(state.auth):Promise.resolve()
};

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
