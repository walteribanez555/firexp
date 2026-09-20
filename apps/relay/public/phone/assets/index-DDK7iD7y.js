(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))s(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const a of i.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function n(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function s(o){if(o.ep)return;o.ep=!0;const i=n(o);fetch(o.href,i)}})();const z=new URLSearchParams(location.search),w=(z.get("room")??"").toUpperCase(),B=z.get("episode")??"episode1",j=`${location.protocol}//${location.hostname}:3001`,F=j.replace(/^http/,"ws");function tt(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36)}let N=sessionStorage.getItem("viewerId");N||(N=tt(),sessionStorage.setItem("viewerId",N));const h=document.getElementById("app"),et=document.getElementById("status-dot"),nt=document.getElementById("status-text"),st=document.getElementById("status-bar");let v=null;function x(t){et.className=t,nt.textContent={connecting:"Connecting…",connected:"Connected",disconnected:"Reconnecting…",error:"Error"}[t]}function ot(t){t&&!v?(v=document.createElement("span"),v.id="host-badge",v.className="host-badge",v.textContent="Host",st.appendChild(v)):!t&&v&&(v.remove(),v=null)}function b(t){h.innerHTML=t}const M=[];let $=null;function d(t){const n=`${new Date().toLocaleTimeString("en",{hour12:!1})} ${t}`;console.log("[phone]",n),M.push(n),M.length>18&&M.shift(),$||($=document.createElement("div"),$.id="dbg",Object.assign($.style,{position:"fixed",bottom:"0",left:"0",right:"0",background:"rgba(0,0,0,.85)",color:"#0f0",fontFamily:"monospace",fontSize:"10px",padding:"6px 8px",zIndex:"9999",maxHeight:"160px",overflowY:"auto",lineHeight:"1.4"}),document.body.appendChild($)),$.innerHTML=M.map(s=>`<div>${s}</div>`).join(""),$.scrollTop=$.scrollHeight}const C=[];let A=0;function W(){return Date.now()+A}function it(){const t=[...C].sort((e,n)=>e-n);A=t[Math.floor(t.length/2)],d(`clock offset=${A}ms (n=${t.length})`)}function at(t=3){for(let e=0;e<t;e++)setTimeout(()=>{if(f&&f.readyState===WebSocket.OPEN){const n={type:"ping",t0:Date.now()};f.send(JSON.stringify(n))}},e*80)}function ct(t){const n=Date.now()-t.t0,s=t.tRelay-(t.t0+n/2);C.push(s),C.length>9&&C.shift(),it(),d(`pong rtt=${n}ms offset=${s.toFixed(1)}ms`)}let P=null;async function X(){const t=navigator;if(t.wakeLock)try{P=await t.wakeLock.request("screen"),d("wake lock acquired")}catch(e){d(`wake lock FAIL: ${e}`)}}async function rt(){if(P){try{await P.release()}catch{}P=null}}document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&f&&f.readyState===WebSocket.OPEN&&X()});function Y(t){var e;try{(e=navigator.vibrate)==null||e.call(navigator,t)}catch{}}let G=0,R=!1,g=null,E=null,q=[],K=!1;const V=new Map;let T=null,k=null,f=null,O=1e3,D=!1;function J(t){D||(x("connecting"),d(`WS → ${F}?room=${t}`),f=new WebSocket(`${F}?room=${t}`),f.onopen=()=>{O=1e3,x("connected"),d("WS open — sending join");const e={type:"join",room:t,viewerId:N};f.send(JSON.stringify(e)),at(3),X()},f.onmessage=e=>{try{const n=JSON.parse(e.data);d(`← ${n.type}`+("chapterId"in n?` ch=${n.chapterId}`:"")),dt(n)}catch(n){d(`parse err: ${n}`)}},f.onerror=e=>{x("error"),d(`WS error: ${JSON.stringify(e)}`)},f.onclose=e=>{if(x("disconnected"),d(`WS closed code=${e.code}`),rt(),!D){const n=O;O=Math.min(O*1.5,15e3),setTimeout(()=>J(t),n)}})}function lt(t,e){if(!f||f.readyState!==WebSocket.OPEN)return;const n={type:"vote",room:w,viewer:G,decisionId:t,action:e,ts:Date.now()};f.send(JSON.stringify(n)),d(`vote → ${e}`)}function dt(t){switch(t.type){case"assigned":{const e=t;G=e.viewer,e.color,R=e.host===!0,V.set(e.viewer,e.color),ot(R),pt();break}case"episode_start":K=!0,m("Story is starting…");break;case"window_open":E=t,T=t.decisionId,k=null,_(t,null,{});break;case"window_open_sync":{T=t.decisionId,{...t.tally},E&&E.decisionId===t.decisionId?_(E,t.closesAt,t.tally):E?Q(t.tally):yt(t);break}case"tally":t.decisionId===T&&({...t.counts},Q(t.counts));break;case"window_closed":{const e=T,n=E;E=null,T=null,Y([80,40,80]),(async()=>{const s=await ft();$t(t.chosen,e,n,s)})();break}case"watching":wt(t);break;case"story_end":ut();break;case"pong":ct(t);break}}async function pt(){const t=`${j}/api/v1/episodes/${B}`;d(`GET ${t}`);try{g=(await(await fetch(t)).json()).data,d(`episode ok — ${g.questionnaire.length} questions`),g.questionnaire.length>0?gt(g.questionnaire):await Z([])}catch(e){d(`loadEpisode FAIL: ${e}`),m("Waiting for the story…")}}async function Z(t){m("Sending your answers…");const e=`${j}/api/v1/rooms/${w}/questionnaire`;d(`POST ${e} (${t.length} answers)`);try{const n=await fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({episodeId:B,answers:t})});d(`questionnaire status=${n.status}`)}catch(n){d(`submitQuestionnaire FAIL: ${n}`)}K||m("Waiting for the story to begin…")}async function ut(){try{q=(await(await fetch(`${j}/api/v1/rooms/${w}`)).json()).data.log}catch{}mt("journey")}async function ft(){try{const t=await fetch(`${j}/api/v1/episodes/${B}/stats`);return t.ok?(await t.json()).data:null}catch{return null}}function ht(){b(`
    <div class="screen center">
      <h1 class="join-title">Join the story</h1>
      <p class="join-subtitle">Enter the code shown on the TV</p>
      <input id="code-input" class="input" type="text" maxlength="8"
             placeholder="XXXX" autocomplete="off" autocorrect="off"
             autocapitalize="characters" spellcheck="false"
             value="${w}" />
      <button id="join-btn" class="btn">Join</button>
    </div>
  `);const t=h.querySelector("#code-input"),e=h.querySelector("#join-btn");e.disabled=!t.value.trim(),t.addEventListener("input",()=>{e.disabled=!t.value.trim()}),e.addEventListener("click",()=>{const n=t.value.trim().toUpperCase();n&&(history.replaceState(null,"",`?room=${n}&episode=${B}`),D=!1,J(n),m("Connecting…"))}),t.value&&t.focus()}function m(t="Waiting…"){b(`
    <div class="screen center">
      <div class="spinner"></div>
      <p class="waiting-msg">${t}</p>
      <div class="room-code">${w}</div>
      <div class="viewers-row" id="viewers"></div>
    </div>
  `),vt()}function vt(){const t=document.getElementById("viewers");t&&(t.innerHTML=[...V.entries()].map(([,e])=>`<div class="viewer-dot" style="background:${e}"></div>`).join(""))}function gt(t){const e=new Map,n=t.map((s,o)=>`
    <div class="q-card" id="q-${s.id}">
      <div class="q-counter">${o+1} / ${t.length}</div>
      <div class="q-text">${s.text}</div>
      <div class="q-options">
        ${s.options.map(i=>`
          <button class="q-opt" data-qid="${s.id}" data-oid="${i.id}">${i.label}</button>
        `).join("")}
      </div>
    </div>
  `).join("");b(`
    <div class="screen">
      <div class="q-header">
        <h2>Before the story begins</h2>
        <p>Your answers shape the path</p>
      </div>
      ${n}
    </div>
  `),h.querySelectorAll(".q-opt").forEach(s=>{s.addEventListener("click",()=>{const o=s.dataset.qid,i=s.dataset.oid;if(e.has(o))return;e.set(o,i),document.getElementById(`q-${o}`).querySelectorAll(".q-opt").forEach(c=>{c.disabled=!0,c.classList.toggle("selected",c.dataset.oid===i),c.classList.toggle("dimmed",c.dataset.oid!==i)}),e.size===t.length&&setTimeout(()=>{const c=[...e.entries()].map(([r,p])=>({questionId:r,optionId:p}));Z(c)},400)})})}function _(t,e,n){const s=t.phase==="pre",o=Object.values(n).reduce((l,u)=>l+u,0),i=t.options.map(l=>{const u=n[l.gesture]??0,y=o>0?Math.round(u/o*100):0;return`
      <button class="d-opt${k===l.gesture?" voted":""}" data-gesture="${l.gesture}">
        <span class="d-opt-label">${l.label}</span>
        <span class="d-tally" id="tally-${l.gesture}">
          <span class="d-tally-bar-wrap"><span class="d-tally-bar" id="tbar-${l.gesture}" style="width:${y}%"></span></span>
          <span class="d-tally-count" id="tcount-${l.gesture}">${u>0?String(u):""}</span>
        </span>
      </button>`}).join("");if(b(`
    <div class="screen decision">
      <div class="d-head">
        <span class="phase-tag${s?"":" live"}">${s?`Question ${t.questionIndex} / ${t.totalQuestions}`:"Live decision"}</span>
        ${t.chapterTitle?`<span class="d-chapter">${t.chapterTitle}</span>`:""}
      </div>
      <h2 class="d-prompt">${t.prompt}</h2>
      <div class="d-options">
        ${i}
      </div>
      <div class="d-foot">
        <div class="timer-track"><div class="timer-fill" id="timer-fill"></div></div>
        <div class="d-foot-row">
          <p class="d-hint" id="d-hint">${k?"Vote sent — tap another to change":"Tap your choice"}</p>
          <span class="d-countdown" id="d-countdown"></span>
        </div>
      </div>
    </div>
  `),k){const l=document.getElementById("d-hint");l.className="d-hint sent",h.querySelectorAll(".d-opt").forEach(u=>{u.classList.toggle("d-opt-alt",u.dataset.gesture!==k)})}const a=document.getElementById("timer-fill"),c=document.getElementById("d-hint"),r=document.getElementById("d-countdown"),p=e??W()+t.duration,L=t.duration;let S=!1;const I=setInterval(()=>{const l=p-W(),u=Math.max(0,Math.min(100,100*(l/L)));if(a.style.width=`${u}%`,l>0){const y=Math.ceil(l/1e3);r.textContent=`${y}s`,y<=3&&!S&&(S=!0,Y([120,60,120]))}else a.style.width="0%",r.textContent="",clearInterval(I)},100);h.querySelectorAll(".d-opt").forEach(l=>{l.addEventListener("click",()=>{const u=l.dataset.gesture;u!==k&&(k=u,lt(t.decisionId,u),h.querySelectorAll(".d-opt").forEach(y=>{const H=y.dataset.gesture===u;y.classList.toggle("voted",H),y.classList.toggle("d-opt-alt",!H)}),c.textContent="Vote sent — tap another to change",c.className="d-hint sent")})})}function yt(t){if(t.closesAt-W()<=0){m("Decision just closed…");return}b(`
    <div class="screen center">
      <p class="waiting-msg">Voting in progress</p>
      <p class="d-countdown-large" id="d-countdown"></p>
      <p class="d-hint" style="margin-top:12px">Loading decision…</p>
    </div>
  `);const n=document.getElementById("d-countdown"),s=t.closesAt,o=setInterval(()=>{const i=s-W();if(i<=0){clearInterval(o),n.textContent="";return}n.textContent=`${Math.ceil(i/1e3)}s`},100)}function Q(t){const e=Object.values(t).reduce((n,s)=>n+s,0);for(const[n,s]of Object.entries(t)){const o=document.getElementById(`tbar-${n}`),i=document.getElementById(`tcount-${n}`);if(!o||!i)continue;const a=e>0?Math.round(s/e*100):0;o.style.width=`${a}%`,i.textContent=s>0?String(s):""}}function $t(t,e,n,s){let o=t;if(n){const a=n.options.find(c=>c.gesture===t);a&&(o=a.label)}let i="";if(s&&e&&s.decisions[e]&&s.decisions[e].total>0){const a=s.decisions[e];let c="",r=0;for(const[p,L]of Object.entries(a.options))L.pct>r&&(r=L.pct,c=p);if(c){let p=c;if(n){const S=n.options.find(I=>I.gesture===c);S&&(p=S.label)}i=`<p class="result-global">${t!=="default"?`Your room chose <strong>${o}</strong> · `:""}<strong>${Math.round(r)}%</strong> of rooms chose <strong>${p}</strong></p>`}}else t!=="default"&&(i=`<p class="result-global">Your room chose <strong>${o}</strong></p>`);b(`
    <div class="screen center">
      <p class="result-label">Decision made</p>
      ${i}
      <div class="spinner" style="margin-top:32px"></div>
      <p class="waiting-msg">Now playing…</p>
    </div>
  `),setTimeout(()=>{h.querySelector(".result-label")&&m("Now playing…")},4500)}function wt(t){b(`
    <div class="screen center">
      <p class="watching-label">Now playing</p>
      <h2 class="watching-ch">${t.chapterTitle}</h2>
      ${t.variantTag?`<p class="watching-path">${t.variantTag}</p>`:""}
      <div class="watching-dots"><span></span><span></span><span></span></div>
    </div>
  `)}function mt(t="journey"){b(`
    <nav class="lib-nav">
      <button class="lib-tab${t==="journey"?" active":""}" data-tab="journey">Journey</button>
      <button class="lib-tab${t==="votes"?" active":""}" data-tab="votes">Votes</button>
      <button class="lib-tab${t==="whatif"?" active":""}" data-tab="whatif">What if?</button>
    </nav>
    <div class="lib-content" id="lib-content"></div>
  `),h.querySelectorAll(".lib-tab").forEach(e=>{e.addEventListener("click",()=>{h.querySelectorAll(".lib-tab").forEach(n=>n.classList.remove("active")),e.classList.add("active"),U(e.dataset.tab)})}),U(t)}function U(t){const e=document.getElementById("lib-content");if(!g||q.length===0){e.innerHTML='<p class="empty-msg">No decisions recorded yet.</p>';return}t==="journey"&&(e.innerHTML=q.map(n=>{const s=g.chapters.find(a=>a.id===n.chapter),o=n.decisions.map(a=>{const c=s==null?void 0:s.decisions.find(r=>r.id===a.decisionId);return`
          <div class="lib-decision">
            <span class="phase-badge ${a.phase}">${a.phase==="pre"?"PRE":"LIVE"}</span>
            <span class="lib-prompt">${(c==null?void 0:c.prompt)??a.decisionId}</span>
            <span class="lib-chosen">→ ${a.chosen}</span>
          </div>`}).join(""),i=(s==null?void 0:s.variants.map(a=>{const c=a.tag===n.variantPlayed||a.when===n.variantPlayed;return`<div class="variant-row ${c?"played":"unplayed"}">${a.tag??a.when}${c?" · played":""}</div>`}).join(""))??"";return`<div class="lib-block"><div class="lib-ch-title">${(s==null?void 0:s.title)??n.chapter}</div>${o}${i}</div>`}).join("")),t==="votes"&&(e.innerHTML=q.flatMap(n=>{const s=g.chapters.find(o=>o.id===n.chapter);return n.decisions.map(o=>{const i=s==null?void 0:s.decisions.find(r=>r.id===o.decisionId);if(!i)return"";const a=i.options.map(r=>{const p=o.votes.filter(I=>I.action===r.gesture),L=r.gesture===o.chosen,S=p.map(I=>`<div class="vote-dot" style="background:${V.get(I.viewer)??"#888"}"></div>`).join("");return`<div class="vote-opt${L?" winner":""}"><div class="vote-label">${r.label}</div><div class="vote-dots">${S}</div></div>`}).join(""),c=o.margin<=1&&o.votes.length>1?'<span class="close-badge">Close call</span>':"";return`<div class="lib-block"><div class="votes-prompt">${i.prompt??i.id}</div>${c}<div class="votes-options">${a}</div></div>`})}).join("")),t==="whatif"&&(e.innerHTML=`<p class="whatif-hint">Tap an option you didn't choose to see what would have happened.</p>`+q.flatMap(n=>{const s=g.chapters.find(o=>o.id===n.chapter);return n.decisions.map(o=>{const i=s==null?void 0:s.decisions.find(c=>c.id===o.decisionId);if(!i)return"";const a=i.options.map((c,r)=>{const p=c.gesture===o.chosen;return`<div class="wi-opt${p?" chosen":""}" data-at="${n.chapter}" data-idx="${r}" data-did="${o.decisionId}">${c.label}${p?" · chosen":""}</div>`}).join("");return`<div class="lib-block"><div class="votes-prompt">${i.prompt??i.id}</div>${a}<div class="wi-result" id="wi-result-${o.decisionId}"></div></div>`})}).join(""),e.querySelectorAll(".wi-opt:not(.chosen)").forEach(n=>{n.addEventListener("click",async()=>{const s=n.dataset.at,o=Number(n.dataset.idx),i=n.dataset.did,a=document.getElementById(`wi-result-${i}`);a.innerHTML='<p class="wi-step">loading…</p>';try{const r=await(await fetch(`${j}/api/v1/rooms/${w}/whatif?at=${s}&option=${o}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({story:g})})).json();a.innerHTML=(r.data.projectedPath??[]).map(p=>`<p class="wi-step">→ ${p}</p>`).join("")||'<p class="wi-step">No alternate path.</p>'}catch{a.innerHTML='<p class="wi-step">(error)</p>'}})}))}w?(m("Connecting…"),J(w)):ht();
