(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))o(s);new MutationObserver(s=>{for(const i of s)if(i.type==="childList")for(const c of i.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&o(c)}).observe(document,{childList:!0,subtree:!0});function n(s){const i={};return s.integrity&&(i.integrity=s.integrity),s.referrerPolicy&&(i.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?i.credentials="include":s.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function o(s){if(s.ep)return;s.ep=!0;const i=n(s);fetch(s.href,i)}})();const U=new URLSearchParams(location.search),$=(U.get("room")??"").toUpperCase(),P=U.get("episode")??"episode1",j=`${location.protocol}//${location.hostname}:3001`,et=j.replace(/^http/,"ws");function nt(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36)}let O=sessionStorage.getItem("viewerId");O||(O=nt(),sessionStorage.setItem("viewerId",O));const h=document.getElementById("app"),st=document.getElementById("status-dot"),ot=document.getElementById("status-text"),it=document.getElementById("status-bar");let y=null;function q(t){st.className=t,ot.textContent={connecting:"Connecting…",connected:"Connected",disconnected:"Reconnecting…",error:"Error"}[t]}function at(t){t&&!y?(y=document.createElement("span"),y.id="host-badge",y.className="host-badge",y.textContent="Host",it.appendChild(y)):!t&&y&&(y.remove(),y=null)}function m(t){h.innerHTML=t}const C=[];let Q=0;function x(){return Date.now()+Q}function ct(){const t=[...C].sort((e,n)=>e-n);Q=t[Math.floor(t.length/2)]}function rt(t=3){for(let e=0;e<t;e++)setTimeout(()=>{if(u&&u.readyState===WebSocket.OPEN){const n={type:"ping",t0:Date.now()};u.send(JSON.stringify(n))}},e*80)}function lt(t){const n=Date.now()-t.t0,o=t.tRelay-(t.t0+n/2);C.push(o),C.length>9&&C.shift(),ct(),`${n}${o.toFixed(1)}`}let N=null;async function X(){const t=navigator;if(t.wakeLock)try{N=await t.wakeLock.request("screen")}catch{}}async function dt(){if(N){try{await N.release()}catch{}N=null}}document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&u&&u.readyState===WebSocket.OPEN&&X()});function Y(t){var e;try{(e=navigator.vibrate)==null||e.call(navigator,t)}catch{}}let z=0,V=!1,f=null,L=null,w=[],F=!1;const D=new Map;let k=null,E=null,T={},G="",K="";const W=[];function Z(t){let e=W.find(n=>n.chapter===t);return e||(e={chapter:t,variantPlayed:K,decisions:[]},W.push(e)),e}function pt(t,e){const n=f==null?void 0:f.chapters.find(a=>a.title===t.chapterTitle),o=(n==null?void 0:n.id)??(G||t.chapterTitle),s=Z(o);if(s.decisions.some(a=>a.decisionId===t.decisionId))return;const i=Object.entries(T).flatMap(([a,r])=>Array.from({length:r},(d,v)=>({viewer:v+1,action:a}))),c=Object.values(T).sort((a,r)=>r-a);s.decisions.push({decisionId:t.decisionId,phase:t.phase,chosen:e,votes:i,margin:(c[0]??0)-(c[1]??0),flagsAfter:{},ts:Date.now()})}let u=null,M=1e3,A=!1;function H(t){A||(q("connecting"),u=new WebSocket(`${et}?room=${t}`),u.onopen=()=>{M=1e3,q("connected");const e={type:"join",room:t,viewerId:O};u.send(JSON.stringify(e)),rt(3),X()},u.onmessage=e=>{try{const n=JSON.parse(e.data);`← ${n.type}`+("chapterId"in n?` ch=${n.chapterId}`:""),ft(n)}catch{}},u.onerror=e=>{q("error"),`${JSON.stringify(e)}`},u.onclose=e=>{if(q("disconnected"),`${e.code}`,dt(),!A){const n=M;M=Math.min(M*1.5,15e3),setTimeout(()=>H(t),n)}})}function ut(t,e){if(!u||u.readyState!==WebSocket.OPEN)return;const n={type:"vote",room:$,viewer:z,decisionId:t,action:e,ts:Date.now()};u.send(JSON.stringify(n))}function ft(t){switch(t.type){case"assigned":{const e=t;z=e.viewer,e.color,V=e.host===!0,D.set(e.viewer,e.color),at(V),ht();break}case"episode_start":F=!0,b("Story is starting…");break;case"window_open":L=t,k=t.decisionId,E=null,T={},J(t,null,{});break;case"window_open_sync":{k=t.decisionId,T={...t.tally},L&&L.decisionId===t.decisionId?J(L,t.closesAt,t.tally):L?_(t.tally):bt(t);break}case"tally":t.decisionId===k&&(T={...t.counts},_(t.counts));break;case"window_closed":{const e=k,n=L;L=null,k=null,n&&pt(n,t.chosen),Y([80,40,80]),(async()=>{const o=await yt();mt(t.chosen,e,n,o)})();break}case"watching":G=t.chapterId,K=t.variantTag,Z(t.chapterId).variantPlayed=t.variantTag,It(t);break;case"story_end":vt();break;case"pong":lt(t);break}}async function ht(){const t=`${j}/api/v1/episodes/${P}`;try{f=(await(await fetch(t)).json()).data,`${f.questionnaire.length}`,f.questionnaire.length>0?$t(f.questionnaire):await tt([])}catch{b("Waiting for the story…")}}async function tt(t){b("Sending your answers…");const e=`${j}/api/v1/rooms/${$}/questionnaire`;`${e}${t.length}`;try{const n=await fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({episodeId:P,answers:t})});`${n.status}`}catch{}F||b("Waiting for the story to begin…")}async function vt(){try{w=(await(await fetch(`${j}/api/v1/rooms/${$}`)).json()).data.log??[]}catch{}(!w||w.length===0)&&(w=W),St("journey")}async function yt(){try{const t=await fetch(`${j}/api/v1/episodes/${P}/stats`);return t.ok?(await t.json()).data:null}catch{return null}}function gt(){m(`
    <div class="screen center">
      <h1 class="join-title">Join the story</h1>
      <p class="join-subtitle">Enter the code shown on the TV</p>
      <input id="code-input" class="input" type="text" maxlength="8"
             placeholder="XXXX" autocomplete="off" autocorrect="off"
             autocapitalize="characters" spellcheck="false"
             value="${$}" />
      <button id="join-btn" class="btn">Join</button>
    </div>
  `);const t=h.querySelector("#code-input"),e=h.querySelector("#join-btn");e.disabled=!t.value.trim(),t.addEventListener("input",()=>{e.disabled=!t.value.trim()}),e.addEventListener("click",()=>{const n=t.value.trim().toUpperCase();n&&(history.replaceState(null,"",`?room=${n}&episode=${P}`),A=!1,H(n),b("Connecting…"))}),t.value&&t.focus()}function b(t="Waiting…"){m(`
    <div class="screen center">
      <div class="spinner"></div>
      <p class="waiting-msg">${t}</p>
      <div class="room-code">${$}</div>
      <div class="viewers-row" id="viewers"></div>
    </div>
  `),wt()}function wt(){const t=document.getElementById("viewers");t&&(t.innerHTML=[...D.entries()].map(([,e])=>`<div class="viewer-dot" style="background:${e}"></div>`).join(""))}function $t(t){const e=new Map,n=t.map((o,s)=>`
    <div class="q-card" id="q-${o.id}">
      <div class="q-counter">${s+1} / ${t.length}</div>
      <div class="q-text">${o.text}</div>
      <div class="q-options">
        ${o.options.map(i=>`
          <button class="q-opt" data-qid="${o.id}" data-oid="${i.id}">${i.label}</button>
        `).join("")}
      </div>
    </div>
  `).join("");m(`
    <div class="screen">
      <div class="q-header">
        <h2>Before the story begins</h2>
        <p>Your answers shape the path</p>
      </div>
      ${n}
    </div>
  `),h.querySelectorAll(".q-opt").forEach(o=>{o.addEventListener("click",()=>{const s=o.dataset.qid,i=o.dataset.oid;if(e.has(s))return;e.set(s,i),document.getElementById(`q-${s}`).querySelectorAll(".q-opt").forEach(a=>{a.disabled=!0,a.classList.toggle("selected",a.dataset.oid===i),a.classList.toggle("dimmed",a.dataset.oid!==i)}),e.size===t.length&&setTimeout(()=>{const a=[...e.entries()].map(([r,d])=>({questionId:r,optionId:d}));tt(a)},400)})})}function J(t,e,n){const o=t.phase==="pre",s=Object.values(n).reduce((l,p)=>l+p,0),i=t.options.map(l=>{const p=n[l.gesture]??0,g=s>0?Math.round(p/s*100):0;return`
      <button class="d-opt${E===l.gesture?" voted":""}" data-gesture="${l.gesture}">
        <span class="d-opt-label">${l.label}</span>
        <span class="d-tally" id="tally-${l.gesture}">
          <span class="d-tally-bar-wrap"><span class="d-tally-bar" id="tbar-${l.gesture}" style="width:${g}%"></span></span>
          <span class="d-tally-count" id="tcount-${l.gesture}">${p>0?String(p):""}</span>
        </span>
      </button>`}).join("");if(m(`
    <div class="screen decision">
      <div class="d-head">
        <span class="phase-tag${o?"":" live"}">${o?`Question ${t.questionIndex} / ${t.totalQuestions}`:"Live decision"}</span>
        ${t.chapterTitle?`<span class="d-chapter">${t.chapterTitle}</span>`:""}
      </div>
      <h2 class="d-prompt">${t.prompt}</h2>
      <div class="d-options">
        ${i}
      </div>
      <div class="d-foot">
        <div class="timer-track"><div class="timer-fill" id="timer-fill"></div></div>
        <div class="d-foot-row">
          <p class="d-hint" id="d-hint">${E?"Vote sent — tap another to change":"Tap your choice"}</p>
          <span class="d-countdown" id="d-countdown"></span>
        </div>
      </div>
    </div>
  `),E){const l=document.getElementById("d-hint");l.className="d-hint sent",h.querySelectorAll(".d-opt").forEach(p=>{p.classList.toggle("d-opt-alt",p.dataset.gesture!==E)})}const c=document.getElementById("timer-fill"),a=document.getElementById("d-hint"),r=document.getElementById("d-countdown"),d=e??x()+t.duration,v=t.duration;let I=!1;const S=setInterval(()=>{const l=d-x(),p=Math.max(0,Math.min(100,100*(l/v)));if(c.style.width=`${p}%`,l>0){const g=Math.ceil(l/1e3);r.textContent=`${g}s`,g<=3&&!I&&(I=!0,Y([120,60,120]))}else c.style.width="0%",r.textContent="",clearInterval(S)},100);h.querySelectorAll(".d-opt").forEach(l=>{l.addEventListener("click",()=>{const p=l.dataset.gesture;p!==E&&(E=p,ut(t.decisionId,p),h.querySelectorAll(".d-opt").forEach(g=>{const B=g.dataset.gesture===p;g.classList.toggle("voted",B),g.classList.toggle("d-opt-alt",!B)}),a.textContent="Vote sent — tap another to change",a.className="d-hint sent")})})}function bt(t){if(t.closesAt-x()<=0){b("Decision just closed…");return}m(`
    <div class="screen center">
      <p class="waiting-msg">Voting in progress</p>
      <p class="d-countdown-large" id="d-countdown"></p>
      <p class="d-hint" style="margin-top:12px">Loading decision…</p>
    </div>
  `);const n=document.getElementById("d-countdown"),o=t.closesAt,s=setInterval(()=>{const i=o-x();if(i<=0){clearInterval(s),n.textContent="";return}n.textContent=`${Math.ceil(i/1e3)}s`},100)}function _(t){const e=Object.values(t).reduce((n,o)=>n+o,0);for(const[n,o]of Object.entries(t)){const s=document.getElementById(`tbar-${n}`),i=document.getElementById(`tcount-${n}`);if(!s||!i)continue;const c=e>0?Math.round(o/e*100):0;s.style.width=`${c}%`,i.textContent=o>0?String(o):""}}function mt(t,e,n,o){let s=t;if(n){const c=n.options.find(a=>a.gesture===t);c&&(s=c.label)}let i="";if(o&&e&&o.decisions[e]&&o.decisions[e].total>0){const c=o.decisions[e];let a="",r=0;for(const[d,v]of Object.entries(c.options))v.pct>r&&(r=v.pct,a=d);if(a){let d=a;if(n){const I=n.options.find(S=>S.gesture===a);I&&(d=I.label)}i=`<p class="result-global">${t!=="default"?`Your room chose <strong>${s}</strong> · `:""}<strong>${Math.round(r)}%</strong> of rooms chose <strong>${d}</strong></p>`}}else t!=="default"&&(i=`<p class="result-global">Your room chose <strong>${s}</strong></p>`);m(`
    <div class="screen center">
      <p class="result-label">Decision made</p>
      ${i}
      <div class="spinner" style="margin-top:32px"></div>
      <p class="waiting-msg">Now playing…</p>
    </div>
  `),setTimeout(()=>{h.querySelector(".result-label")&&b("Now playing…")},4500)}function It(t){m(`
    <div class="screen center">
      <p class="watching-label">Now playing</p>
      <h2 class="watching-ch">${t.chapterTitle}</h2>
      ${t.variantTag?`<p class="watching-path">${t.variantTag}</p>`:""}
      <div class="watching-dots"><span></span><span></span><span></span></div>
    </div>
  `)}function St(t="journey"){m(`
    <nav class="lib-nav">
      <button class="lib-tab${t==="journey"?" active":""}" data-tab="journey">Journey</button>
      <button class="lib-tab${t==="votes"?" active":""}" data-tab="votes">Votes</button>
      <button class="lib-tab${t==="whatif"?" active":""}" data-tab="whatif">What if?</button>
    </nav>
    <div class="lib-content" id="lib-content"></div>
  `),h.querySelectorAll(".lib-tab").forEach(e=>{e.addEventListener("click",()=>{h.querySelectorAll(".lib-tab").forEach(n=>n.classList.remove("active")),e.classList.add("active"),R(e.dataset.tab)})}),R(t)}function R(t){const e=document.getElementById("lib-content");if(!f||w.length===0){e.innerHTML='<p class="empty-msg">No decisions recorded yet.</p>';return}t==="journey"&&(e.innerHTML=w.map(n=>{const o=f.chapters.find(c=>c.id===n.chapter),s=n.decisions.map(c=>{const a=o==null?void 0:o.decisions.find(r=>r.id===c.decisionId);return`
          <div class="lib-decision">
            <span class="phase-badge ${c.phase}">${c.phase==="pre"?"PRE":"LIVE"}</span>
            <span class="lib-prompt">${(a==null?void 0:a.prompt)??c.decisionId}</span>
            <span class="lib-chosen">→ ${c.chosen}</span>
          </div>`}).join(""),i=(o==null?void 0:o.variants.map(c=>{const a=c.tag===n.variantPlayed||c.when===n.variantPlayed;return`<div class="variant-row ${a?"played":"unplayed"}">${c.tag??c.when}${a?" · played":""}</div>`}).join(""))??"";return`<div class="lib-block"><div class="lib-ch-title">${(o==null?void 0:o.title)??n.chapter}</div>${s}${i}</div>`}).join("")),t==="votes"&&(e.innerHTML=w.flatMap(n=>{const o=f.chapters.find(s=>s.id===n.chapter);return n.decisions.map(s=>{const i=o==null?void 0:o.decisions.find(r=>r.id===s.decisionId);if(!i)return"";const c=i.options.map(r=>{const d=s.votes.filter(S=>S.action===r.gesture),v=r.gesture===s.chosen,I=d.map(S=>`<div class="vote-dot" style="background:${D.get(S.viewer)??"#888"}"></div>`).join("");return`<div class="vote-opt${v?" winner":""}"><div class="vote-label">${r.label}</div><div class="vote-dots">${I}</div></div>`}).join(""),a=s.margin<=1&&s.votes.length>1?'<span class="close-badge">Close call</span>':"";return`<div class="lib-block"><div class="votes-prompt">${i.prompt??i.id}</div>${a}<div class="votes-options">${c}</div></div>`})}).join("")),t==="whatif"&&(e.innerHTML=`<p class="whatif-hint">Tap an option you didn't choose to see what would have happened.</p>`+w.flatMap(n=>{const o=f.chapters.find(s=>s.id===n.chapter);return n.decisions.map(s=>{const i=o==null?void 0:o.decisions.find(a=>a.id===s.decisionId);if(!i)return"";const c=i.options.map((a,r)=>{const d=a.gesture===s.chosen;return`<div class="wi-opt${d?" chosen":""}" data-at="${n.chapter}" data-idx="${r}" data-did="${s.decisionId}">${a.label}${d?" · chosen":""}</div>`}).join("");return`<div class="lib-block"><div class="votes-prompt">${i.prompt??i.id}</div>${c}<div class="wi-result" id="wi-result-${s.decisionId}"></div></div>`})}).join(""),e.querySelectorAll(".wi-opt:not(.chosen)").forEach(n=>{n.addEventListener("click",async()=>{const o=n.dataset.at,s=Number(n.dataset.idx),i=n.dataset.did,c=document.getElementById(`wi-result-${i}`);c.innerHTML='<p class="wi-step">loading…</p>';try{const r=await(await fetch(`${j}/api/v1/rooms/${$}/whatif?at=${o}&option=${s}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({story:f})})).json();c.innerHTML=(r.data.projectedPath??[]).map(d=>`<p class="wi-step">→ ${d}</p>`).join("")||'<p class="wi-step">No alternate path.</p>'}catch{c.innerHTML='<p class="wi-step">(error)</p>'}})}))}$?(b("Connecting…"),H($)):gt();
