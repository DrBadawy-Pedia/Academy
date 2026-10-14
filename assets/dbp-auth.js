import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
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
const configured = !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);

const state = {
  user: null,
  auth: null,
  db: null,
  pendingKey: "dbp_pendingAttempts_v3",
  recentAttempts: new Map(),
  quizHookTimer: null
};

const css = `
#dbpAuthShield{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 50% 20%,rgba(24,89,92,.18),transparent 40%),rgba(5,12,24,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);opacity:1;transition:opacity .22s ease}
#dbpAuthShield.dbp-auth-hidden{opacity:0;pointer-events:none}
#dbpAuthCard{width:min(440px,100%);position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.99),rgba(247,249,250,.98));color:#132238;border:1px solid rgba(255,255,255,.7);border-radius:28px;padding:30px;box-shadow:0 32px 100px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.8);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
#dbpAuthCard:before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:linear-gradient(90deg,#c69a45,#e5c775,#178f8c)}
.dbp-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:23px}.dbp-auth-logo{width:48px;height:48px;border-radius:15px;background:linear-gradient(145deg,#0d3345,#1a6a6d);display:grid;place-items:center;color:#f3d79a;font-family:Georgia,serif;font-weight:900;font-size:17px;letter-spacing:-.5px;box-shadow:0 10px 25px rgba(16,68,73,.2)}
.dbp-auth-brandtext b{display:block;font-size:12px;letter-spacing:.15em;color:#10283e}.dbp-auth-brandtext span{display:block;margin-top:3px;font-size:10px;letter-spacing:.08em;color:#84909a;text-transform:uppercase}
.dbp-auth-kicker{font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#a97a29;margin-bottom:9px}.dbp-auth-title{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:31px;line-height:1.06;letter-spacing:-.025em;color:#10243a}.dbp-auth-copy{margin:12px 0 22px;color:#687783;font-size:13.5px;line-height:1.68}
.dbp-google-btn{width:100%;border:1px solid #dce3e7;background:#fff;color:#172b3f;border-radius:14px;padding:14px 16px;display:flex;align-items:center;justify-content:center;gap:11px;font-size:14px;font-weight:850;cursor:pointer;transition:.18s ease;box-shadow:0 6px 18px rgba(19,43,63,.05)}.dbp-google-btn:hover{transform:translateY(-1px);border-color:#6bb3af;box-shadow:0 9px 24px rgba(19,101,98,.12)}.dbp-google-btn:active{transform:translateY(0)}.dbp-google-btn:disabled{opacity:.62;cursor:wait;transform:none}.dbp-google-g{width:20px;height:20px;display:block}
.dbp-auth-note{margin:14px 0 0;color:#96a0a8;font-size:10.5px;line-height:1.55;text-align:center}.dbp-auth-error{display:none;margin:14px 0 0;padding:11px 12px;border:1px solid #f0c8c4;border-radius:11px;background:#fff2f0;color:#9a2c24;font-size:11.5px;line-height:1.5}.dbp-auth-error.show{display:block}.dbp-loader{width:28px;height:28px;border:3px solid #dfe7e8;border-top-color:#178f8c;border-radius:50%;animation:dbpSpin .75s linear infinite;margin:8px 0 4px}@keyframes dbpSpin{to{transform:rotate(360deg)}}
#dbpAuthMini{position:fixed;right:14px;bottom:12px;z-index:2147482000;display:none;align-items:center;gap:7px;padding:8px 10px;border:1px solid rgba(220,227,231,.9);background:rgba(255,255,255,.94);color:#687783;border-radius:999px;font:750 10.5px/1 Inter,system-ui,sans-serif;box-shadow:0 8px 22px rgba(20,35,50,.1);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}#dbpAuthMini[data-state="ok"] #dbpSyncStatus{color:#147a62}#dbpAuthMini[data-state="pending"] #dbpSyncStatus{color:#946b1d}#dbpAuthMini button{border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
@media(max-width:560px){#dbpAuthCard{padding:26px 21px;border-radius:23px}.dbp-auth-title{font-size:27px}#dbpAuthMini{right:10px;bottom:10px}}
`;

function ensureStyles(){
  if(document.getElementById("dbpAuthStyle")) return;
  const style=document.createElement("style");
  style.id="dbpAuthStyle";
  style.textContent=css;
  document.head.appendChild(style);
}

function googleIcon(){
  return `<svg class="dbp-google-g" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.39l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6.01 6.01 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.48H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.52l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.5l2.86-2.86A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.35 2.59C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>`;
}

function shell(inner){
  return `<div class="dbp-auth-brand"><div class="dbp-auth-logo">DB</div><div class="dbp-auth-brandtext"><b>DR BADAWY</b><span>Pediatrics Academy</span></div></div>${inner}`;
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
  shield.classList.remove("dbp-auth-hidden");
  if(mode==="loading"){
    card.innerHTML=shell(`<div class="dbp-auth-kicker">Secure learning access</div><h2 class="dbp-auth-title" id="dbpAuthTitle">Opening your Academy…</h2><p class="dbp-auth-copy">Checking your saved sign-in.</p><div class="dbp-loader" aria-label="Loading"></div>`);
  }else{
    card.innerHTML=shell(`<div class="dbp-auth-kicker">One sign-in · all sections</div><h2 class="dbp-auth-title" id="dbpAuthTitle">Continue to the Academy.</h2><p class="dbp-auth-copy">Sign in once with Google. Your account stays connected across lessons and quizzes, and quiz progress can be synced automatically.</p><button class="dbp-google-btn" id="dbpGoogleBtn">${googleIcon()}<span>Continue with Google</span></button><div class="dbp-auth-error" id="dbpAuthError" role="alert"></div><p class="dbp-auth-note">Your Google name and email are used only to identify your learning progress.</p>`);
    document.getElementById("dbpGoogleBtn")?.addEventListener("click",startGoogleSignIn);
  }
  return shield;
}

function hideShield(){
  const shield=document.getElementById("dbpAuthShield");
  if(!shield) return;
  shield.classList.add("dbp-auth-hidden");
  setTimeout(()=>shield.remove(),230);
}

function showError(message){
  const box=document.getElementById("dbpAuthError");
  if(!box) return;
  box.textContent=message;
  box.classList.add("show");
}

function setButtonBusy(busy){
  const button=document.getElementById("dbpGoogleBtn");
  if(!button) return;
  button.disabled=busy;
  const label=button.querySelector("span");
  if(label) label.textContent=busy?"Connecting to Google…":"Continue with Google";
}

function friendlyAuthError(error){
  const code=error?.code||"";
  if(code==="auth/popup-closed-by-user"||code==="auth/cancelled-popup-request") return "The Google window was closed before sign-in finished. Please try again.";
  if(code==="auth/popup-blocked") return "Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.";
  if(code==="auth/network-request-failed") return "Connection problem. Check your internet, then try again.";
  if(code==="auth/unauthorized-domain") return "Sign-in is not available on this web address yet.";
  if(code==="auth/operation-not-allowed") return "Google sign-in is temporarily unavailable.";
  if(code==="auth/web-storage-unsupported") return "This browser is blocking the storage needed to keep you signed in. Try a normal browser tab.";
  if(code==="auth/too-many-requests") return "Too many sign-in attempts were made. Please wait a moment and try again.";
  return "Google sign-in could not finish. Please try again.";
}

function withTimeout(promise,ms){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error("timeout"),{code:"auth/timeout"})),ms))
  ]);
}

async function startGoogleSignIn(){
  if(!state.auth){
    showError("Sign-in is still loading. Refresh the page and try again.");
    return;
  }
  setButtonBusy(true);
  const provider=new GoogleAuthProvider();
  try{
    const cred=await withTimeout(signInWithPopup(state.auth,provider),60000);
    if(cred?.user) await handleSignedIn(cred.user);
  }catch(error){
    showError(error?.code==="auth/timeout"?"Google sign-in is taking too long. Close any old sign-in window, then try again.":friendlyAuthError(error));
    setButtonBusy(false);
  }
}

function pending(){
  try{return JSON.parse(localStorage.getItem(state.pendingKey)||"[]")}catch{return []}
}

function savePending(items){
  try{localStorage.setItem(state.pendingKey,JSON.stringify(items.slice(-30)))}catch{}
}

function attemptFingerprint(data){
  return [location.pathname,String(data.sectionId??0),String(data.score??0),String(data.total??0)].join("|");
}

function queueAttempt(data){
  const key=attemptFingerprint(data);
  const now=Date.now();
  const last=state.recentAttempts.get(key)||0;
  if(now-last<5000) return;
  state.recentAttempts.set(key,now);
  const items=pending();
  items.push({...data,queuedAt:new Date().toISOString()});
  savePending(items);
  flushPending();
}

async function writeAttempt(data){
  if(!state.user||!state.db) throw new Error("not-authenticated");
  const uid=state.user.uid;
  const score=Math.max(0,Number(data.score)||0);
  const total=Math.max(1,Number(data.total)||1);
  const pct=Math.max(0,Math.min(100,Math.round((score/total)*100)));
  await addDoc(collection(state.db,"students",uid,"attempts"),{
    uid,
    quizId:String(data.quizId||quizIdFromPath()),
    sectionId:Number.isFinite(Number(data.sectionId))?Number(data.sectionId):0,
    title:String(data.title||document.title||"Quiz").slice(0,180),
    score:Math.min(score,total),
    total,
    pct,
    path:location.pathname,
    clientCompletedAt:new Date().toISOString(),
    completedAt:serverTimestamp()
  });
}

async function flushPending(){
  if(!state.user||!state.db||!navigator.onLine) return;
  const items=pending();
  if(!items.length) return;
  setMiniStatus("Syncing…","pending");
  const remaining=[];
  for(const item of items){
    try{await writeAttempt(item)}catch{remaining.push(item)}
  }
  savePending(remaining);
  setMiniStatus(remaining.length?"Sync pending":"✓ Sync on",remaining.length?"pending":"ok");
}

function quizIdFromPath(){
  return (location.pathname.split("/").pop()||"quiz").replace(/\.html?$/i,"")||"quiz";
}

function hookQuizProgress(){
  if(state.quizHookTimer) return;
  let tries=0;
  state.quizHookTimer=setInterval(()=>{
    tries++;
    if(typeof window.saveQuizProgress==="function"&&!window.saveQuizProgress.__dbpWrapped){
      const original=window.saveQuizProgress;
      const wrapped=function(sectionIdx,score,total){
        const result=original.apply(this,arguments);
        queueAttempt({quizId:quizIdFromPath(),sectionId:sectionIdx,score,total,title:document.title});
        return result;
      };
      wrapped.__dbpWrapped=true;
      window.saveQuizProgress=wrapped;
      clearInterval(state.quizHookTimer);
      state.quizHookTimer=null;
    }else if(tries>150){
      clearInterval(state.quizHookTimer);
      state.quizHookTimer=null;
    }
  },100);
}

function addMiniAccount(){
  let mini=document.getElementById("dbpAuthMini");
  if(!mini){
    mini=document.createElement("div");
    mini.id="dbpAuthMini";
    mini.innerHTML=`<span id="dbpSyncStatus">Signed in</span><span>·</span><button type="button" id="dbpSignOut">Sign out</button>`;
    document.body.appendChild(mini);
    document.getElementById("dbpSignOut")?.addEventListener("click",async()=>{
      try{await signOut(state.auth)}finally{location.reload()}
    });
  }
  mini.style.display="flex";
}

function setMiniStatus(text,status=""){
  addMiniAccount();
  const mini=document.getElementById("dbpAuthMini");
  const label=document.getElementById("dbpSyncStatus");
  if(label) label.textContent=text;
  if(mini) mini.dataset.state=status;
}

async function syncProfile(user){
  if(!state.db||!user) return;
  await setDoc(doc(state.db,"students",user.uid),{
    uid:user.uid,
    name:user.displayName||"",
    email:user.email||"",
    photoUrl:user.photoURL||"",
    provider:user.providerData?.[0]?.providerId||"google.com",
    lastSeenAt:serverTimestamp()
  },{merge:true});
}

async function handleSignedIn(user){
  state.user=user;
  hideShield();
  addMiniAccount();
  hookQuizProgress();
  try{
    await syncProfile(user);
    setMiniStatus("✓ Sync on","ok");
  }catch{
    setMiniStatus("Sync pending","pending");
  }
  flushPending();
}

function handleSignedOut(){
  state.user=null;
  document.getElementById("dbpAuthMini")?.remove();
  makeShield("signin");
}

async function boot(){
  makeShield("loading");
  if(!configured){
    makeShield("signin");
    const button=document.getElementById("dbpGoogleBtn");
    if(button) button.disabled=true;
    showError("Sign-in is temporarily unavailable. Please refresh the page after a moment.");
    return;
  }
  try{
    const app=getApps().length?getApps()[0]:initializeApp(cfg);
    state.auth=getAuth(app);
    state.db=getFirestore(app);
    try{await setPersistence(state.auth,browserLocalPersistence)}catch{}

    let initialResolved=false;
    const initialState=new Promise(resolve=>{
      onAuthStateChanged(state.auth,async user=>{
        if(user) await handleSignedIn(user); else handleSignedOut();
        if(!initialResolved){initialResolved=true;resolve();}
      },()=>{
        makeShield("signin");
        showError("Sign-in could not be checked. Refresh the page and try again.");
        if(!initialResolved){initialResolved=true;resolve();}
      });
    });

    await Promise.race([initialState,new Promise(resolve=>setTimeout(resolve,12000))]);
    if(!initialResolved){
      makeShield("signin");
      showError("Sign-in is taking longer than expected. Check your connection and try again.");
    }
    addEventListener("online",flushPending);
  }catch(error){
    console.error("Academy sign-in boot failed",error);
    makeShield("signin");
    const button=document.getElementById("dbpGoogleBtn");
    if(button) button.disabled=true;
    showError("Sign-in could not load. Refresh the page and try again.");
  }
}

window.DBPAuth={
  getUser:()=>state.user,
  recordQuizResult:data=>queueAttempt(data||{}),
  signOut:()=>state.auth?signOut(state.auth):Promise.resolve()
};

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
