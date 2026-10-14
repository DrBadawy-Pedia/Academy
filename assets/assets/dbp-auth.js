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

const config = window.DBP_FIREBASE_CONFIG || {};
const isConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

const state = {
  auth: null,
  db: null,
  user: null,
  booted: false,
  resultHooked: false,
  queueKey: "dbp_pendingAttempts_v2",
  lastAttemptFingerprint: "",
  lastAttemptAt: 0
};

const style = `
:root{--dbp-auth-navy:#132743;--dbp-auth-navy2:#0d1d33;--dbp-auth-teal:#1c8d88;--dbp-auth-gold:#e4b958;--dbp-auth-white:#fff;--dbp-auth-muted:#aeb9c7}
#dbpAuthGate{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 18% 14%,rgba(28,141,136,.22),transparent 35%),radial-gradient(circle at 88% 82%,rgba(228,185,88,.14),transparent 30%),linear-gradient(145deg,rgba(9,19,34,.96),rgba(18,40,69,.97));backdrop-filter:blur(13px);-webkit-backdrop-filter:blur(13px);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;transition:opacity .22s ease,visibility .22s ease}
#dbpAuthGate.dbp-auth-leave{opacity:0;visibility:hidden;pointer-events:none}
#dbpAuthGate:before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.7),transparent 82%)}
.dbp-auth-shell{position:relative;width:min(438px,100%);overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:28px;background:linear-gradient(160deg,rgba(25,45,72,.94),rgba(12,28,49,.96));box-shadow:0 34px 100px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.06)}
.dbp-auth-accent{height:3px;background:linear-gradient(90deg,var(--dbp-auth-gold),#f2d083 48%,var(--dbp-auth-teal))}
.dbp-auth-inner{padding:30px 30px 26px}
.dbp-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:29px}
.dbp-auth-mark{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,#f1cf7b,#b88428);box-shadow:0 10px 28px rgba(0,0,0,.22);color:#10243d;font:800 16px/1 Georgia,serif;letter-spacing:-1px}
.dbp-auth-brandcopy{min-width:0;color:#fff;font:650 15px/1.1 Fraunces,Georgia,serif;letter-spacing:-.01em}.dbp-auth-brandcopy small{display:block;margin-top:5px;color:rgba(255,255,255,.53);font:800 9px/1.1 Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase}
.dbp-auth-eyebrow{margin:0 0 10px;color:var(--dbp-auth-gold);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.dbp-auth-title{margin:0;color:#fff;font:650 32px/1.08 Fraunces,Georgia,serif;letter-spacing:-.025em}
.dbp-auth-copy{margin:12px 0 22px;color:rgba(255,255,255,.66);font-size:13.5px;line-height:1.7}
.dbp-auth-google{width:100%;min-height:52px;border:1px solid rgba(255,255,255,.18);border-radius:14px;background:#fff;color:#17233f;display:flex;align-items:center;justify-content:center;gap:11px;padding:12px 16px;font:800 13.5px/1 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 10px 28px rgba(0,0,0,.16);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.dbp-auth-google:hover{transform:translateY(-1px);box-shadow:0 14px 34px rgba(0,0,0,.23)}.dbp-auth-google:active{transform:translateY(0)}.dbp-auth-google:disabled{opacity:.68;cursor:wait;transform:none}
.dbp-auth-google svg{width:20px;height:20px;flex:none}
.dbp-auth-meta{display:flex;align-items:flex-start;gap:8px;margin-top:15px;color:rgba(255,255,255,.42);font-size:10.5px;line-height:1.55}.dbp-auth-meta svg{width:14px;height:14px;flex:none;margin-top:1px}
.dbp-auth-error{display:none;margin-top:14px;padding:11px 12px;border:1px solid rgba(255,125,125,.18);border-radius:12px;background:rgba(168,43,43,.17);color:#ffd3d3;font-size:11.5px;line-height:1.55}.dbp-auth-error.show{display:block}
.dbp-auth-retry{display:none;width:100%;margin-top:10px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.06);color:#fff;padding:10px 13px;font:800 11.5px/1 Inter,system-ui,sans-serif;cursor:pointer}.dbp-auth-retry.show{display:block}
.dbp-auth-loading{display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.62);font-size:12px}.dbp-auth-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.16);border-top-color:var(--dbp-auth-gold);border-radius:50%;animation:dbpSpin .72s linear infinite}@keyframes dbpSpin{to{transform:rotate(360deg)}}
#dbpAccountDock{position:fixed;right:14px;bottom:14px;z-index:2147482000;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.dbp-account-trigger{width:38px;height:38px;border:1px solid rgba(255,255,255,.28);border-radius:50%;display:grid;place-items:center;background:#15314d;color:#fff;box-shadow:0 8px 24px rgba(12,30,48,.24);cursor:pointer}.dbp-account-trigger svg{width:18px;height:18px}.dbp-account-trigger:hover{transform:translateY(-1px)}
.dbp-account-pop{position:absolute;right:0;bottom:48px;width:190px;padding:12px;border:1px solid rgba(23,45,65,.12);border-radius:14px;background:#fff;color:#17233f;box-shadow:0 18px 50px rgba(12,30,48,.2);opacity:0;transform:translateY(5px) scale(.98);pointer-events:none;transition:.16s ease}.dbp-account-pop.open{opacity:1;transform:none;pointer-events:auto}.dbp-account-status{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800}.dbp-account-dot{width:7px;height:7px;border-radius:50%;background:#1c9a77;box-shadow:0 0 0 3px rgba(28,154,119,.12)}.dbp-account-sub{margin:5px 0 10px;color:#7a8792;font-size:10px;line-height:1.45}.dbp-account-signout{width:100%;border:1px solid #e4e9ec;border-radius:9px;background:#f8fafb;color:#52606d;padding:8px 10px;font:800 10.5px/1 Inter,system-ui,sans-serif;cursor:pointer}.dbp-account-signout:hover{border-color:#c9d3d8;color:#17233f}
@media(max-width:560px){#dbpAuthGate{padding:14px}.dbp-auth-shell{border-radius:23px}.dbp-auth-inner{padding:24px 20px 22px}.dbp-auth-brand{margin-bottom:24px}.dbp-auth-title{font-size:28px}.dbp-auth-copy{font-size:13px}.dbp-auth-google{min-height:50px}#dbpAccountDock{right:10px;bottom:10px}}
@media(prefers-reduced-motion:reduce){#dbpAuthGate,.dbp-auth-google,.dbp-account-pop,.dbp-account-trigger{transition:none!important}.dbp-auth-spinner{animation:none!important}}
`;

function addStyles(){
  if(document.getElementById("dbpAuthStyles")) return;
  const el=document.createElement("style");
  el.id="dbpAuthStyles";
  el.textContent=style;
  document.head.appendChild(el);
}

function googleIcon(){
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.2c0-.64-.06-1.26-.17-1.86H12v3.52h5.25a4.49 4.49 0 0 1-1.95 2.95v2.45h3.16c1.85-1.7 2.89-4.22 2.89-7.06Z"/><path fill="#34A853" d="M12 21.72c2.63 0 4.84-.87 6.46-2.37l-3.16-2.45c-.88.59-2 .94-3.3.94-2.55 0-4.71-1.72-5.48-4.03H3.26v2.53A9.76 9.76 0 0 0 12 21.72Z"/><path fill="#FBBC05" d="M6.52 13.81A5.9 5.9 0 0 1 6.22 12c0-.63.11-1.25.3-1.81V7.66H3.26A9.73 9.73 0 0 0 2.24 12c0 1.55.37 3.02 1.02 4.34l3.26-2.53Z"/><path fill="#EA4335" d="M12 6.16c1.44 0 2.72.49 3.73 1.46l2.8-2.8A9.37 9.37 0 0 0 12 2.28a9.76 9.76 0 0 0-8.74 5.38l3.26 2.53C7.29 7.88 9.45 6.16 12 6.16Z"/></svg>`;
}

function lockIcon(){
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 10V8a4.5 4.5 0 0 1 9 0v2M6.5 10h11a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
}

function checkIcon(){
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7.5 12.5 3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function ensureGate(mode="loading"){
  addStyles();
  let gate=document.getElementById("dbpAuthGate");
  if(!gate){
    gate=document.createElement("div");
    gate.id="dbpAuthGate";
    gate.setAttribute("role","dialog");
    gate.setAttribute("aria-modal","true");
    gate.setAttribute("aria-labelledby","dbpAuthTitle");
    document.body.appendChild(gate);
  }
  if(mode==="loading"){
    gate.innerHTML=`<div class="dbp-auth-shell"><div class="dbp-auth-accent"></div><div class="dbp-auth-inner"><div class="dbp-auth-brand"><div class="dbp-auth-mark">MB</div><div class="dbp-auth-brandcopy">Dr Badawy Academy<small>Pediatrics</small></div></div><div class="dbp-auth-loading"><span class="dbp-auth-spinner"></span><span>Restoring your session…</span></div></div></div>`;
  }else{
    gate.innerHTML=`<div class="dbp-auth-shell"><div class="dbp-auth-accent"></div><div class="dbp-auth-inner"><div class="dbp-auth-brand"><div class="dbp-auth-mark">MB</div><div class="dbp-auth-brandcopy">Dr Badawy Academy<small>Pediatrics</small></div></div><p class="dbp-auth-eyebrow">YOUR LEARNING SPACE</p><h1 class="dbp-auth-title" id="dbpAuthTitle">Continue your learning.</h1><p class="dbp-auth-copy">Sign in once with Google. Your progress and quiz results stay connected to your account across the Academy.</p><button class="dbp-auth-google" id="dbpGoogleSignIn" type="button">${googleIcon()}<span>Continue with Google</span></button><div class="dbp-auth-error" id="dbpAuthError" role="alert"></div><button class="dbp-auth-retry" id="dbpAuthRetry" type="button">Try again</button><div class="dbp-auth-meta">${lockIcon()}<span>Your Google name and email are used only to identify and save your learning progress.</span></div></div></div>`;
    document.getElementById("dbpGoogleSignIn")?.addEventListener("click",signInNow);
    document.getElementById("dbpAuthRetry")?.addEventListener("click",()=>location.reload());
    queueMicrotask(()=>document.getElementById("dbpGoogleSignIn")?.focus({preventScroll:true}));
  }
  return gate;
}

function closeGate(){
  const gate=document.getElementById("dbpAuthGate");
  if(!gate) return;
  gate.classList.add("dbp-auth-leave");
  setTimeout(()=>gate.remove(),240);
}

function setSignInBusy(busy){
  const btn=document.getElementById("dbpGoogleSignIn");
  if(!btn) return;
  btn.disabled=busy;
  const label=btn.querySelector("span");
  if(label) label.textContent=busy?"Opening Google…":"Continue with Google";
}

function showAuthError(message,{retry=false}={}){
  const box=document.getElementById("dbpAuthError");
  if(box){box.textContent=message;box.classList.add("show")}
  document.getElementById("dbpAuthRetry")?.classList.toggle("show",retry);
}

function readableError(error){
  const code=error?.code||"";
  if(code==="auth/popup-closed-by-user") return "The Google window was closed before sign-in finished. Please try again.";
  if(code==="auth/popup-blocked") return "Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.";
  if(code==="auth/network-request-failed") return "We couldn't reach Google. Check your connection and try again.";
  if(code==="auth/unauthorized-domain") return "Google sign-in is not enabled for this website yet.";
  if(code==="auth/operation-not-allowed") return "Google sign-in has not been enabled yet.";
  if(code==="auth/cancelled-popup-request") return "Another sign-in window is already open.";
  return "Sign-in didn't finish. Please try again.";
}

async function signInNow(){
  if(!state.auth){
    showAuthError("Sign-in is still loading. Please try again in a moment.");
    return;
  }
  setSignInBusy(true);
  document.getElementById("dbpAuthError")?.classList.remove("show");
  try{
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:"select_account"});
    await signInWithPopup(state.auth,provider);
  }catch(error){
    showAuthError(readableError(error));
    setSignInBusy(false);
  }
}

function addAccountDock(){
  if(document.getElementById("dbpAccountDock")) return;
  const dock=document.createElement("div");
  dock.id="dbpAccountDock";
  dock.innerHTML=`<button class="dbp-account-trigger" id="dbpAccountTrigger" type="button" aria-label="Account and sync status" aria-expanded="false">${checkIcon()}</button><div class="dbp-account-pop" id="dbpAccountPop"><div class="dbp-account-status"><span class="dbp-account-dot"></span><span>Progress sync on</span></div><div class="dbp-account-sub">Your Academy progress is connected to your account.</div><button class="dbp-account-signout" id="dbpAccountSignOut" type="button">Sign out</button></div>`;
  document.body.appendChild(dock);
  const trigger=document.getElementById("dbpAccountTrigger");
  const pop=document.getElementById("dbpAccountPop");
  trigger?.addEventListener("click",()=>{
    const open=!pop.classList.contains("open");
    pop.classList.toggle("open",open);
    trigger.setAttribute("aria-expanded",String(open));
  });
  document.addEventListener("click",e=>{
    if(!dock.contains(e.target)){
      pop.classList.remove("open");
      trigger?.setAttribute("aria-expanded","false");
    }
  });
  document.getElementById("dbpAccountSignOut")?.addEventListener("click",async()=>{
    try{await signOut(state.auth)}finally{location.reload()}
  });
}

async function syncProfile(user){
  if(!state.db||!user) return;
  await setDoc(doc(state.db,"students",user.uid),{
    uid:user.uid,
    name:user.displayName||"",
    email:user.email||"",
    photoUrl:user.photoURL||"",
    provider:"google.com",
    lastSeenAt:serverTimestamp()
  },{merge:true});
}

function readQueue(){
  try{return JSON.parse(localStorage.getItem(state.queueKey)||"[]")}catch{return []}
}
function writeQueue(items){
  try{localStorage.setItem(state.queueKey,JSON.stringify(items.slice(-40)))}catch{}
}
function uniqueId(){
  if(globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2,11)}`;
}
function pageQuizId(){
  const file=(location.pathname.split("/").pop()||"quiz").replace(/\.html?$/i,"");
  return file||"quiz";
}

function queueAttempt(data){
  const total=Math.max(1,Number(data?.total)||1);
  const score=Math.min(total,Math.max(0,Number(data?.score)||0));
  const quizId=String(data?.quizId||pageQuizId());
  const sectionId=Number.isFinite(Number(data?.sectionId))?Number(data.sectionId):0;
  const fingerprint=[location.pathname,quizId,sectionId,score,total].join("|");
  const now=Date.now();
  if(fingerprint===state.lastAttemptFingerprint && now-state.lastAttemptAt<5000) return;
  state.lastAttemptFingerprint=fingerprint;
  state.lastAttemptAt=now;
  const item={
    attemptId:uniqueId(),
    quizId,
    sectionId,
    title:String(data?.title||document.title||"Quiz").slice(0,180),
    score,
    total,
    pct:Math.round(score/total*100),
    path:location.pathname,
    queuedAt:new Date().toISOString()
  };
  const q=readQueue();
  q.push(item);
  writeQueue(q);
  flushQueue();
}

async function writeAttempt(item){
  if(!state.user||!state.db) throw new Error("not-authenticated");
  await addDoc(collection(state.db,"students",state.user.uid,"attempts"),{
    uid:state.user.uid,
    attemptId:String(item.attemptId||uniqueId()),
    quizId:String(item.quizId||pageQuizId()),
    sectionId:Number(item.sectionId)||0,
    title:String(item.title||document.title||"Quiz").slice(0,180),
    score:Number(item.score)||0,
    total:Math.max(1,Number(item.total)||1),
    pct:Math.min(100,Math.max(0,Number(item.pct)||0)),
    path:String(item.path||location.pathname),
    clientCompletedAt:String(item.queuedAt||new Date().toISOString()),
    completedAt:serverTimestamp()
  });
}

async function flushQueue(){
  if(!state.user||!state.db||!navigator.onLine) return;
  const q=readQueue();
  if(!q.length) return;
  const remaining=[];
  for(const item of q){
    try{await writeAttempt(item)}catch{remaining.push(item)}
  }
  writeQueue(remaining);
}

function readStoredProgress(sectionId=0){
  try{
    const all=JSON.parse(localStorage.getItem("dbp_quizProgress")||"{}");
    const pathId=pageQuizId();
    const candidates=[pathId,pathId.replace(/-quiz$/i,"")];
    for(const key of candidates){
      const entry=all?.[key]?.[sectionId];
      if(entry?.done && Number.isFinite(Number(entry.score)) && Number.isFinite(Number(entry.total))) return entry;
    }
  }catch{}
  return null;
}

function installResultHooks(){
  if(state.resultHooked||!/quiz/i.test(location.pathname)) return;
  let ticks=0;
  const timer=setInterval(()=>{
    ticks++;
    if(typeof window.saveQuizProgress==="function" && !window.saveQuizProgress.__dbpAuthWrapped){
      const original=window.saveQuizProgress;
      const wrapped=function(sectionId,score,total){
        const out=original.apply(this,arguments);
        queueAttempt({sectionId,score,total,title:document.title});
        return out;
      };
      wrapped.__dbpAuthWrapped=true;
      window.saveQuizProgress=wrapped;
      state.resultHooked=true;
      clearInterval(timer);
      return;
    }
    if(typeof window.persistResult==="function" && !window.persistResult.__dbpAuthWrapped){
      const original=window.persistResult;
      const wrapped=function(sectionId=0){
        const out=original.apply(this,arguments);
        const p=readStoredProgress(sectionId);
        if(p) queueAttempt({sectionId,score:p.score,total:p.total,title:document.title});
        return out;
      };
      wrapped.__dbpAuthWrapped=true;
      window.persistResult=wrapped;
      state.resultHooked=true;
      clearInterval(timer);
      return;
    }
    if(typeof window.persist==="function" && !window.persist.__dbpAuthWrapped){
      const original=window.persist;
      const wrapped=function(){
        const out=original.apply(this,arguments);
        const p=readStoredProgress(0);
        if(p) queueAttempt({sectionId:0,score:p.score,total:p.total,title:document.title});
        return out;
      };
      wrapped.__dbpAuthWrapped=true;
      window.persist=wrapped;
      state.resultHooked=true;
      clearInterval(timer);
      return;
    }
    if(ticks>160) clearInterval(timer);
  },100);
}

async function boot(){
  if(state.booted) return;
  state.booted=true;
  ensureGate("loading");

  if(!isConfigured){
    ensureGate("signin");
    document.getElementById("dbpGoogleSignIn")?.setAttribute("disabled","");
    showAuthError("Sign-in is not configured yet.",{retry:true});
    return;
  }

  try{
    const app=getApps().length?getApps()[0]:initializeApp(config);
    state.auth=getAuth(app);
    state.db=getFirestore(app);
    try{await setPersistence(state.auth,browserLocalPersistence)}catch{}

    let resolved=false;
    const slowTimer=setTimeout(()=>{
      if(!resolved){
        ensureGate("signin");
        showAuthError("Sign-in is taking longer than expected. Check your connection and try again.",{retry:true});
      }
    },10000);

    onAuthStateChanged(state.auth,async user=>{
      resolved=true;
      clearTimeout(slowTimer);
      state.user=user;
      if(user){
        closeGate();
        addAccountDock();
        installResultHooks();
        try{await syncProfile(user)}catch{}
        flushQueue();
      }else{
        ensureGate("signin");
      }
    },()=>{
      resolved=true;
      clearTimeout(slowTimer);
      ensureGate("signin");
      showAuthError("We couldn't restore your session. Please try again.",{retry:true});
    });

    addEventListener("online",flushQueue);
  }catch{
    ensureGate("signin");
    document.getElementById("dbpGoogleSignIn")?.setAttribute("disabled","");
    showAuthError("The sign-in service couldn't load. Check your connection and try again.",{retry:true});
  }
}

window.DBPAuth={
  getUser:()=>state.user,
  recordQuizResult:data=>queueAttempt(data||{}),
  signOut:()=>state.auth?signOut(state.auth):Promise.resolve()
};

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
