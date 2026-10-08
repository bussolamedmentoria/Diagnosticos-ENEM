/* Rota Natureza 40+ — plataforma interativa. Vanilla JS, hash routing, progress in localStorage. */
(function () {
'use strict';
const META = window.__META;
const SB = window.SB, USER = window.__USER, PROFILE = window.__PROFILE || {};
const CH = META.chapters;                       // [{id,name,onda,d,cl,avg,pres,what}]
const CHI = Object.fromEntries(CH.map((c, i) => [c.id, Object.assign({ i }, c)]));
const Q = Object.fromEntries(META.q.map(q => [q.id, q]));
const DNAME = { B: 'Biologia', Q: 'Química', F: 'Física' };
const DSHORT = { B: 'Bio', Q: 'Quí', F: 'Fís' };
const COB = { C: 'Explique', Q: 'Conta', G: 'Dados', V: 'Figura', S: 'Solução', X: 'Experimento' };
const EXAMS = ['18R','18P','19R','19P','20R','20P','21R','21P','22R','22P','23R','23P','24R','24P','25R','25P'];
const exLabel = e => `ENEM 20${e.slice(0, 2)}${e[2] === 'P' ? ' · PPL' : ''}`;
const qLabel = id => { const q = Q[id]; return `${exLabel(q.e)} · questão ${q.n}`; };
const ARTS = { 'Movimento':'do','Impacto':'do','Onda':'da','Materiais':'dos','Proporção':'da','Circuito':'do','Célula':'da','Equilíbrio':'do','Teia':'da','Gene':'do','Calor':'do','Molécula':'da','Adaptação':'da','Corpo':'do','Saúde Pública':'da','Afinidade':'da','Elétrons':'dos','Campo':'do','Energia':'da','Defesa':'da' };

// ---------------------------------------------------------------- dates
const DAY = 864e5;
const EXAM_DAY = new Date(2026, 10, 15);
const DAY1 = new Date(2026, 10, 8);
const DEADLINE = new Date(2026, 10, 5);          // fim da trilha: depois disso, pausa do 1º dia e semana de revisão
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const fmt = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const fmtLong = d => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const hm = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m} min`; };
const clock = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };

// ---------------------------------------------------------------- state (local cache + conta no Supabase)
const KEY = 'natureza40.v2.' + USER.id;
function blank() { return { v: 2, ts: 0, diag: { ans: {}, dbt: {}, cur: 0, el: 0, step: 'intro', sabia: {} }, fila: [], sem: {}, trilha: null, hpw: null, cutP3: false, bank: {}, teo: {}, sims: {}, rev: {}, log: [], srs: {}, err: {}, day: {}, plan: {}, revDay: null }; }
let S;
(function () {
  let local = null; try { local = JSON.parse(localStorage.getItem(KEY)); } catch (e) { local = null; }
  const remote = window.__STATE && window.__STATE.diag ? window.__STATE : null;
  S = local && remote ? ((local.ts || 0) > (remote.ts || 0) ? local : remote) : (remote || local || blank());
  S = Object.assign(blank(), S);
})();
let saveT = null, pushT = null, pushWarned = false;
function save(now) {
  S.ts = Date.now();
  clearTimeout(saveT);
  const w = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } };
  if (now) w(); else saveT = setTimeout(w, 250);
  clearTimeout(pushT); pushT = setTimeout(pushRemote, now ? 50 : 1500);
}
async function pushRemote() {
  clearTimeout(pushT);
  let pct = null; try { pct = S.trilha ? plan().pct : null; } catch (e) { pct = null; }
  const { error } = await SB.from('progress').upsert({ user_id: USER.id, state: S, trilha: S.trilha, diag_score: S.diag.score ?? null, pct, updated_at: new Date().toISOString() });
  if (error && !pushWarned) { pushWarned = true; toast('Sem conexão: seu progresso será salvo quando a internet voltar.'); }
  if (!error) pushWarned = false;
}
function logAnswers(rows) {
  if (!rows.length) return;
  SB.from('answers').insert(rows.map(r => Object.assign({ user_id: USER.id }, r))).then(({ error }) => { if (error) console.warn('answers', error.message); });
}
window.addEventListener('pagehide', () => { if (pushT) pushRemote(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && pushT) pushRemote(); });
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- images (packed per exam third; diagnostic pack)
const PACKS = {}, IMG = {};
const DIAGSET = new Set(META.diag);
const packOf = id => { if (DIAGSET.has(id)) return 'img_diag'; const q = Q[id]; return `img_${q.e}_${q.n <= 105 ? 1 : q.n <= 120 ? 2 : 3}`; };
function loadPack(name) {
  if (!PACKS[name]) PACKS[name] = fetch(`data/${name}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(o => { Object.assign(IMG, o); return o; }).catch(e => { delete PACKS[name]; throw e; });
  return PACKS[name];
}
async function imgData(id) { if (!IMG[id]) await loadPack(packOf(id)); return IMG[id]; }
function hydrate(root) {
  root.querySelectorAll('img[data-q]:not([src])').forEach(async el => {
    try { const [w, h, b] = await imgData(el.dataset.q); el.width = w; el.height = h; if (el.closest('.qimgbox')) el.style.maxWidth = w > 1000 ? '100%' : 'min(100%, 640px)'; el.src = 'data:image/webp;base64,' + b; }
    catch (e) { el.alt = 'Não foi possível carregar a imagem. Verifique a conexão e abra a página de novo.'; el.style.minHeight = '0'; }
  });
}
function imgBlob(id) {
  const b = atob(IMG[id][2]); const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return new Blob([u], { type: 'image/webp' });
}

// ---------------------------------------------------------------- plan model
const STEP = {
  teo:   { l: 'Ler o resumo teórico', m: 45, to: c => `#t-${c}` },
  teoex: { l: 'Exercícios do resumo: 3 diretos e 5 contextualizados', m: 35, to: c => `#t-${c}-ex` },
  cap:   { l: 'Ler o capítulo do padrão (gatilhos e armadilhas)', m: 25, to: c => `#p-${c}` },
  mod:   { l: 'Refazer as questões-modelo sem olhar a resolução', m: 15, to: c => `#p-${c}` },
  tre:   { l: 'Treino do padrão (questões reais com correção)', m: 35, to: c => `#p-${c}-treino` },
  apr:   { l: '2 exercícios de aprofundamento do resumo', m: 20, to: c => `#t-${c}-ex` },
};
const SIMDEF = {
  A:  { e: '21R', a: 91, b: 135, name: 'Simulado A', sub: 'ENEM 2021 · prova completa', m: 180 },
  B:  { e: '21P', a: 91, b: 135, name: 'Simulado B', sub: 'ENEM 2021 PPL · prova completa', m: 180 },
  C:  { e: '25P', a: 91, b: 135, name: 'Simulado C', sub: 'ENEM 2025 PPL · prova completa', m: 180 },
  A1: { e: '21R', a: 91, b: 113, name: 'Meio simulado 1', sub: 'ENEM 2021 · questões 91 a 113', m: 95 },
  A2: { e: '21R', a: 114, b: 135, name: 'Meio simulado 2', sub: 'ENEM 2021 · questões 114 a 135', m: 95 },
};
const simIds = k => { const d = SIMDEF[k]; const out = []; for (let n = d.a; n <= d.b; n++) out.push(`${d.e}_${n}`); return out; };
const TRILHAS = {
  base:   { name: 'Trilha Base', rng: '0 a 17 acertos', hpw: 10, sims: ['A1', 'A2', 'B'], color: 'r',
            text: 'Seu ganho está nos fundamentos. Boa parte da fila começa pela teoria: um conteúdo bem entendido rende questões em vários padrões.' },
  avanco: { name: 'Trilha Avanço', rng: '18 a 29 acertos', hpw: 10, sims: ['A', 'B', 'C'], color: 'y',
            text: 'Você conhece boa parte do conteúdo e perde pontos no reconhecimento do padrão e nas pegadinhas. O capítulo de cada padrão é o seu principal material.' },
  mais40: { name: 'Trilha 40+', rng: '30 a 40 acertos', hpw: 10, sims: ['A', 'B', 'C'], color: 'g',
            text: 'Os seus pontos estão nos detalhes: distratores, contas com uma etapa a menos e a Onda 3. Sua fila é curta, então sobra tempo para lapidar.' },
};
const PRANK = { P1: 0, P2: 1, P3: 2 };
function stepsFor(rota, trilha) {
  const s = rota === 'T' ? ['teo', 'teoex', 'cap', 'mod', 'tre'] : ['cap', 'mod', 'tre'];
  if (trilha === 'mais40') s.push('apr');
  return s;
}
function sortFila() {
  const sub = it => it.prio === 'P2' ? (it.color === 'y' ? CHI[it.cid].onda : 3.5) : 0;
  S.fila.sort((a, b) => (PRANK[a.prio] - PRANK[b.prio]) || (sub(a) - sub(b)) || (CHI[a.cid].i - CHI[b.cid].i));
}
function itemDone(it) { return it.steps.every(k => it.done[k]); }
function activeItems() { return S.fila.filter(it => !(S.cutP3 && it.prio === 'P3' && !itemDone(it))); }
function plan() {
  const items = activeItems();
  let rem = 0, tot = 0;
  for (const it of items) for (const k of it.steps) { tot += STEP[k].m; if (!it.done[k]) rem += STEP[k].m; }
  const sims = S.trilha ? TRILHAS[S.trilha].sims : [];
  for (const k of sims) { tot += SIMDEF[k].m; if (!(S.sims[k] && S.sims[k].done)) rem += SIMDEF[k].m; }
  const hpw = S.hpw || (S.trilha ? TRILHAS[S.trilha].hpw : 10);
  const perDay = hpw * 60 / 7;
  const t0 = today();
  const days = rem > 0 ? Math.ceil(rem / perDay) : 0;
  const end = new Date(t0.getTime() + days * DAY);
  const left = daysBetween(t0, DEADLINE);
  const need = left > 0 ? rem / left * 7 / 60 : Infinity;
  const status = rem === 0 ? 'done' : (end <= DEADLINE ? 'ok' : (left > 0 ? 'late' : 'over'));
  return { rem, tot, hpw, days, end, left, need, status, pct: tot ? Math.round((tot - rem) / tot * 100) : 0 };
}
function nextSteps(n) {
  const out = [];
  for (const it of activeItems()) for (const k of it.steps) if (!it.done[k]) { out.push({ it, k }); break; }
  const res = out.slice(0, n);
  if (S.trilha) for (const k of TRILHAS[S.trilha].sims) if (!(S.sims[k] && S.sims[k].done)) { res.push({ sim: k }); break; }
  return res;
}
function markStep(cid, k, val) {
  const it = S.fila.find(x => x.cid === cid);
  if (!it || !it.steps.includes(k)) return false;
  if (!!it.done[k] === val) return false;
  it.done[k] = val; if (val) { S.log.push({ t: Date.now(), cid, k }); if (k !== 'tre' && typeof addStudy === 'function') addStudy(STEP[k].m); } save(); return true;
}

// ---------------------------------------------------------------- diagnosis scoring
function diagScore() {
  const ids = META.diag; let ok = 0; const per = {};
  ids.forEach((id, i) => {
    const q = Q[id]; const a = S.diag.ans[i]; const d = !!S.diag.dbt[i];
    const hit = a === q.g && !d; if (hit) ok++;
    (per[q.c] = per[q.c] || { ok: 0, idx: [] }).idx.push(i); if (hit) per[q.c].ok++;
  });
  return { ok, per };
}
const colorOf = n => n >= 2 ? 'g' : n === 1 ? 'y' : 'r';
function prioOf(color, onda) {
  if (color === 'g') return null;
  if (color === 'r') return onda <= 2 ? 'P1' : 'P2';
  return onda <= 2 ? 'P2' : 'P3';
}
function buildTrail() {
  const { ok, per } = diagScore();
  S.trilha = ok <= 17 ? 'base' : ok <= 29 ? 'avanco' : 'mais40';
  S.sem = {}; S.fila = [];
  for (const c of CH) {
    const col = colorOf(per[c.id].ok); S.sem[c.id] = col;
    const pr = prioOf(col, c.onda);
    if (!pr) continue;
    const rota = S.diag.sabia[c.id] === false ? 'T' : 'P';
    S.fila.push({ cid: c.id, prio: pr, color: col, rota, steps: stepsFor(rota, S.trilha), done: {}, origin: 'diagnóstico' });
  }
  sortFila();
  S.diag.score = ok; S.diag.doneAt = Date.now();
  // credit work already done before the diagnosis (treino / theory exercises answered)
  for (const it of S.fila) autoCredit(it.cid);
  save(true);
}

// ---------------------------------------------------------------- auto-credit from activity
function autoCredit(cid) {
  const tre = META.treino[cid] || [];
  if (tre.length && tre.every(id => S.bank[id])) markStep(cid, 'tre', true);
  const t = S.teo[cid];
  if (t && t.n) {
    if (t.dc >= 8) markStep(cid, 'teoex', true);
    if (t.a >= 2) markStep(cid, 'apr', true);
  }
}

// ---------------------------------------------------------------- AI (função própria no Supabase)
const FN_URL = window.__CFG.url + '/functions/v1/ai';
const AI_ERR = {
  limit: 'Você chegou ao limite de pedidos à IA de hoje. Amanhã ele renova.',
  not_configured: 'A IA está sendo configurada. Tente de novo mais tarde.',
  auth: 'Sua sessão expirou. Saia e entre de novo.',
  upstream: 'A IA não conseguiu responder agora. Tente de novo em instantes.',
};
const aiMsg = e => AI_ERR[e && e.code] || AI_ERR.upstream;
async function callAI(payload, onText, signal) {
  const { data } = await SB.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw { code: 'auth' };
  let r;
  try {
    r = await fetch(FN_URL, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: window.__CFG.key }, body: JSON.stringify(payload) });
  } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'upstream' }; }
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) { j = {}; } throw { code: r.status === 429 ? 'limit' : r.status === 503 ? 'not_configured' : r.status === 401 ? 'auth' : 'upstream' }; }
  const reader = r.body.getReader(), dec = new TextDecoder(); let text = '';
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); if (text.trim()) onText(text); }
  } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'upstream', text }; }
  if (!text.trim()) throw { code: 'upstream' };
  return text;
}
// Fórmulas em LaTeX nas respostas da IA: $$…$$ e \[…\] (bloco), $…$ e \(…\) (na linha). Renderizadas com KaTeX (+ mhchem para \ce{}).
function tex(src, display) {
  src = src.trim();
  if (!src) return '';
  if (window.katex) {
    // Bloco em modo "inline" com \displaystyle: mesmo visual, mas a conta quebra de linha após =, ⟹ etc. em telas estreitas
    try { return window.katex.renderToString(display ? '\\displaystyle ' + src : src, { displayMode: false, throwOnError: false, strict: 'ignore', output: 'html', trust: false }); } catch (e) { /* cai no texto puro */ }
  }
  return display ? `<code class="tex">${esc(src)}</code>` : `<code>${esc(src)}</code>`;
}
function md(t) {
  const math = [];
  const keep = (src, display) => { math.push([src, display]); return `\u0000${math.length - 1}\u0000`; };
  t = String(t)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => '\n' + keep(m, true) + '\n')
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => '\n' + keep(m, true) + '\n')
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => keep(m, false))
    // $…$ na linha: abre colado ao conteúdo e fecha sem dígito logo depois (não confunde com "R$ 10" ou "R$10 e R$20")
    .replace(/(^|[^\\$\w])\$(?![\s$])([^$\n]*?[^\s\\$])\$(?!\d)/g, (_, pre, m) => pre + keep(m, false));
  const lines = esc(t).split('\n'); let html = '', inList = false;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  for (let l of lines) {
    if (/^\s*\u0000\d+\u0000\s*$/.test(l) && math[+l.trim().slice(1, -1)][1]) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<div class="mathb">' + l.trim() + '</div>'; continue;
    }
    if (/^\s*[-•]\s+/.test(l)) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>'; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^#{1,4}\s+/.test(l)) html += '<h4>' + inline(l.replace(/^#{1,4}\s+/, '')) + '</h4>';
    else if (l.trim()) html += '<p>' + inline(l) + '</p>';
  }
  if (inList) html += '</ul>';
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => tex(math[i][0], math[i][1]));
}
const AI_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>';
function aiBox(title, intro, btn, action, attrs) {
  return `<div class="ai" ${attrs || ''}><div class="h">${AI_ICON}${esc(title)}</div>
    ${intro ? `<div class="small muted">${intro}</div>` : ''}
    <div class="row"><button class="btn sm" data-act="${action}">${esc(btn)}</button><button class="btn sm ghost" data-act="ai-stop" hidden>Parar</button></div>
    <div class="out"></div></div>`;
}
async function runAI(box, payload) {
  const out = box.querySelector('.out'), stop = box.querySelector('[data-act=ai-stop]'), go = box.querySelector('.btn:not([data-act=ai-stop])');
  const ctl = new AbortController(); box._ctl = ctl;
  out.innerHTML = '<p class="think">Pensando…</p>'; if (stop) stop.hidden = false; if (go) go.disabled = true;
  try {
    const text = await callAI(payload, t => { out.innerHTML = md(t); }, ctl.signal);
    out.innerHTML = md(text);
  } catch (e) {
    if (e && e.code === 'cancelled') out.innerHTML = e.text ? md(e.text) : '';
    else out.innerHTML = (e && e.text ? md(e.text) : '') + `<p class="small muted">${esc(aiMsg(e))}</p>`;
  } finally { if (stop) stop.hidden = true; if (go) go.disabled = false; }
}
async function explainQuestion(box, id, mine) {
  const q = Q[id], c = CHI[q.c];
  let txt = '';
  try { if (!META._texts) META._texts = await (await fetch('data/texts.json')).json(); txt = META._texts[id] || ''; } catch (e) { txt = ''; }
  let image = '';
  try { await imgData(id); image = IMG[id][2]; } catch (e) { image = ''; }
  runAI(box, { kind: 'explain', qid: id, mine: mine || '', gab: q.g, label: qLabel(id), pattern: `${c.name} (${c.what})`, cob: COB[q.m] || '', comment: q.k ? q.k.replace(/<[^>]+>/g, '') : '', text: txt.slice(0, 5000), image });
}

// ---------------------------------------------------------------- question card
function qCard(id, opt) {
  // opt: {mode:'practice'|'review', label, context}
  const q = Q[id]; const c = CHI[q.c]; const rec = S.bank[id];
  const annulled = !'ABCDE'.includes(q.g);
  const mode = opt && opt.mode || 'practice';
  const mine = mode === 'review' ? opt.mine : mode === 'practice' ? rec && rec.a : undefined;
  const answered = mode === 'review' || (mode === 'practice' && !!rec);
  const pickAct = mode === 'srs' ? 'srs-pick' : 'q-pick';
  const btns = 'ABCDE'.split('').map(L => {
    let cls = 'opt';
    if (answered) { if (L === q.g) cls += ' right'; else if (L === mine) cls += ' wrong'; }
    return `<button class="${cls}" data-act="${pickAct}" data-q="${id}" data-l="${L}" ${answered || annulled ? 'disabled' : ''} aria-label="Alternativa ${L}">${L}</button>`;
  }).join('');
  let fb = '';
  if (annulled) fb = '<div class="fb na">Esta questão foi anulada pelo Inep. Use-a só para estudo.</div>';
  else if (answered) {
    const ok = mine === q.g;
    fb = `<div class="fb ${ok ? 'ok' : 'no'}">${mine ? (ok ? `<b>Certo.</b> Gabarito ${q.g}.` : `<b>Você marcou ${mine}.</b> O gabarito é ${q.g}.`) : `<b>Sem resposta.</b> O gabarito é ${q.g}.`}${(mode === 'review' ? opt.dbt : rec && rec.d) && ok ? ' Você marcou dúvida: conte como ponto a revisar.' : ''}</div>`;
    if (q.k) fb += `<div class="com"><b class="l">Comentário do material</b>${q.k}</div>`;
    const dbtFlag = mode === 'review' ? opt.dbt : rec && rec.d;
    if ((!ok || dbtFlag) && opt && opt.noMot !== true) fb += motivoBox(id);
    fb += aiBox('Explicação com IA', 'Passo a passo no método do material, com o motivo de cada alternativa errada.', 'Explicar esta questão', 'ai-explain', `data-q="${id}" data-mine="${mine || ''}"`);
  }
  return `<div class="qc" data-qc="${id}" data-label="${esc(opt && opt.label || '')}">
    <div class="qh">${opt && opt.label ? `<span class="tag">${esc(opt.label)}</span>` : ''}<span>${esc(qLabel(id))}</span>
      <span class="dtag ${q.d}">${DSHORT[q.d]}</span>${mode !== 'exam' && (answered || (opt && opt.showPat)) ? `<a href="#p-${c.id}">Padrão ${esc(c.name)}</a>` : ''}
      ${q.t && (answered || (opt && opt.showPat)) ? `<span class="muted">· ${esc(q.t)}</span>` : ''}</div>
    <div class="qimgbox"><img data-q="${id}" alt="Questão ${q.n} do ${exLabel(q.e)}"></div>
    ${!answered && !annulled ? `<label class="dbt"><input type="checkbox" data-dbt="${id}"> Estou em dúvida ou chutei</label>` : ''}
    <div class="opts">${btns}</div>${fb}</div>`;
}
function pickPractice(id, L, card) {
  const q = Q[id];
  const d = !!(card.querySelector(`[data-dbt="${id}"]`) || {}).checked;
  const secs = takeSeconds(id), src = card.closest('#treino') ? 'treino' : 'banco';
  S.bank[id] = { a: L, ok: L === q.g, d, t: Date.now(), s: secs };
  if (L !== q.g || d) registerMiss(id, src, L, d);
  addStudy((secs || 90) / 60);
  logAnswers([{ qid: id, source: src, letter: L, correct: L === q.g, doubt: d, seconds: secs }]);
  save(); autoCredit(q.c);
  const html = qCard(id, { label: card.dataset.label || '' });
  const tmp = document.createElement('div'); tmp.innerHTML = html; const nc = tmp.firstElementChild;
  card.replaceWith(nc); hydrate(nc);
  refreshSide();
}

// ---------------------------------------------------------------- exam runner (diagnóstico + simulados)
let TICK = null;
function stopTick() { clearInterval(TICK); TICK = null; }
function runner(cfg) {
  // cfg: {ids, st (state obj with ans,dbt,cur,el), title, sub, target (s), finishAct, labelFn}
  const st = cfg.st, i = st.cur || 0, id = cfg.ids[i];
  const n = cfg.ids.length, answered = cfg.ids.filter((_, k) => st.ans[k]).length;
  const grid = cfg.ids.map((_, k) => `<button class="${st.ans[k] ? 'a' : ''} ${st.dbt[k] ? 'd' : ''} ${k === i ? 'cur' : ''}" data-act="run-go" data-i="${k}">${cfg.labelFn(k)}</button>`).join('');
  const q = Q[id];
  const opts = 'ABCDE'.split('').map(L => `<button class="opt ${st.ans[i] === L ? 'sel' : ''}" data-act="run-pick" data-l="${L}" aria-label="Alternativa ${L}">${L}</button>`).join('');
  return `<div class="stack">
    <div><div class="eyebrow">${esc(cfg.sub)}</div><h1 class="v">${cfg.title}</h1></div>
    <div class="runbar"><span class="timer" id="timer">${clock(st.el)}</span><span class="muted small">de ${clock(cfg.target)} sugeridos</span>
      <span class="badge" style="margin-left:auto">${answered}/${n} respondidas</span><button class="btn sm lime" data-act="run-end">Entregar</button></div>
    <div id="endbox"></div>
    <div class="qc"><div class="qh"><span class="tag">${cfg.labelFn(i)}</span><span>${esc(qLabel(id))}</span></div>
      <div class="qimgbox"><img data-q="${id}" alt="Questão ${q.n}"></div>
      <label class="dbt"><input type="checkbox" data-act="run-dbt" ${st.dbt[i] ? 'checked' : ''}> Estou em dúvida ou chutei</label>
      <div class="opts">${opts}</div>
      <div class="row"><button class="btn ghost sm" data-act="run-go" data-i="${i - 1}" ${i === 0 ? 'disabled' : ''}>← Anterior</button>
        <button class="btn sm" data-act="run-go" data-i="${i + 1}" ${i === n - 1 ? 'disabled' : ''} style="margin-left:auto">Próxima →</button></div></div>
    <div class="panel"><h3 class="v" style="margin-bottom:10px">Mapa da prova</h3><div class="qgrid">${grid}</div>
      <p class="small muted" style="margin:10px 0 0">Azul: respondida. “?”: marcada como dúvida. Você pode voltar a qualquer questão antes de entregar.</p></div></div>`;
}
function startTick(st) {
  stopTick();
  let last = Date.now();
  TICK = setInterval(() => {
    const now = Date.now(), dt = (now - last) / 1000; st.el += dt; last = now;
    st.tq = st.tq || {}; st.tq[st.cur || 0] = (st.tq[st.cur || 0] || 0) + dt; addStudy(dt / 60);
    const t = document.getElementById('timer'); if (t) t.textContent = clock(st.el); else stopTick();
    save();
  }, 1000);
}

// ---------------------------------------------------------------- views
const V = {};
const app = () => document.getElementById('view');
function setView(html, after) {
  stopTick();
  const el = app(); el.innerHTML = `<div class="wrap">${html}</div>`;
  hydrate(el); watchCards(el); if (after) after(el);
}

// ---- início
V.inicio = () => {
  const dleft = daysBetween(today(), EXAM_DAY);
  if (!S.diag.score && S.diag.score !== 0) {
    return setView(`
    <section class="hero stack" style="gap:18px">
      <div class="eyebrow" style="color:var(--lime)">Rota Natureza 40+ · Mentoria Mário Machado · ENEM 2026</div>
      <div class="row" style="align-items:flex-end;gap:18px"><div class="big40">40+</div><h1 class="v" style="max-width:16ch">em Ciências da Natureza</h1></div>
      <p class="lede">Os 20 padrões que o ENEM repete em Biologia, Química e Física, 720 questões reais de 2018 a 2025 e os resumos teóricos de cada conteúdo. Tudo começa com um diagnóstico de 40 questões: ele monta a sua trilha, com a fila do que estudar e a data em que você termina.</p>
      <div class="flow3"><div><b>1</b>Faça o diagnóstico aqui mesmo, em cerca de 2 horas.</div><div><b>2</b>Responda quais conteúdos você já conhecia.</div><div><b>3</b>Receba a trilha pronta, com tempo e data de término.</div></div>
      <div class="row"><a class="btn lime" href="#diag">Começar o diagnóstico</a><a class="btn ghost" href="#padroes" style="color:#fff">Explorar os padrões</a></div>
    </section>
    <div class="tiles">
      <div class="tile"><div class="k">Até o 2º dia</div><div class="v">${dleft > 0 ? dleft : 0}</div><div class="s">dias até 15/11, Natureza e Matemática</div></div>
      <div class="tile"><div class="k">Banco</div><div class="v">720</div><div class="s">questões reais, classificadas por padrão</div></div>
      <div class="tile"><div class="k">Padrões</div><div class="v">20</div><div class="s">cobrem todas as questões de 2018 a 2025</div></div>
      <div class="tile"><div class="k">Resumos</div><div class="v">20</div><div class="s">teoria do zero, com 10 exercícios resolvidos cada</div></div>
    </div>`);
  }
  const p = plan(), T = TRILHAS[S.trilha];
  const st = { done: ['ok', 'Trilha concluída'], ok: ['ok', 'No prazo'], late: ['warn', 'Atenção ao prazo'], over: ['bad', 'Prazo da trilha encerrado'] }[p.status];
  const nx = nextSteps(3);
  const nxHtml = nx.length ? nx.map(s => s.sim ? `<div class="step"><span class="dot y"></span><label><b>${SIMDEF[s.sim].name}</b> · ${SIMDEF[s.sim].sub}</label><span class="m">${hm(SIMDEF[s.sim].m)}</span><a class="btn sm" href="#sim-${s.sim}">Abrir</a></div>`
    : `<div class="step"><input type="checkbox" id="nx-${s.it.cid}-${s.k}" data-act="step" data-c="${s.it.cid}" data-k="${s.k}"><label for="nx-${s.it.cid}-${s.k}"><b>${esc(CHI[s.it.cid].name)}</b> · ${STEP[s.k].l}</label><span class="m">${hm(STEP[s.k].m)}</span><a class="btn sm" href="${STEP[s.k].to(s.it.cid)}">Abrir</a></div>`).join('')
    : '<p class="muted">Nada pendente na fila. Faça questões do banco nos padrões que mais erra.</p>';
  setView(`
    <div><div class="eyebrow">Seu painel</div><h1 class="v">${T.name}: <em>${p.pct}%</em> feito</h1></div>
    <div class="tiles">
      <div class="tile"><div class="k">Falta estudar</div><div class="v">${hm(p.rem)}</div><div class="s">com ${p.hpw} h por semana de Natureza</div></div>
      <div class="tile"><div class="k">Término previsto</div><div class="v">${p.rem ? fmt(p.end) : '✓'}</div><div class="s"><span class="badge ${st[0]}">${st[1]}</span></div></div>
      <div class="tile"><div class="k">Diagnóstico</div><div class="v">${S.diag.score}/40</div><div class="s">acertos sem dúvida</div></div>
      <div class="tile"><div class="k">Até a prova</div><div class="v">${Math.max(0, dleft)}</div><div class="s">dias até 15/11</div></div>
    </div>
    <div class="pbar" aria-label="Progresso da trilha"><i style="width:${p.pct}%"></i></div>
    ${p.status === 'late' ? `<div class="chg">No ritmo atual, você termina em ${fmt(p.end)}, depois de ${fmt(DEADLINE)}. Para terminar a tempo, estude <b>${Math.ceil(p.need)} h por semana</b>${S.fila.some(i => i.prio === 'P3') && !S.cutP3 ? ' ou corte os itens P3 na página da trilha' : ''}.</div>` : ''}
    <div class="cols2">
      <section class="panel stack"><div class="row"><h2 class="v">Próximos passos</h2><a href="#trilha" style="margin-left:auto;font-weight:700">Ver a trilha completa →</a></div>
        <div class="stepl" style="border:0;padding:0">${nxHtml}</div></section>
      <section class="panel stack"><h2 class="v">Semáforo dos padrões</h2>${semaBoard()}
        <p class="small muted" style="margin:0">Atualizado pelo diagnóstico e pelos simulados.</p></section>
    </div>
    ${aiBox('Orientação do tutor', 'A IA lê seu semáforo, sua fila e seus resultados e sugere o foco dos próximos 7 dias.', 'Pedir orientação', 'ai-coach')}`);
};
function semaBoard() {
  return `<div class="sema">${CH.map(c => `<a href="#p-${c.id}"><span class="dot ${S.sem[c.id] || ''}"></span>${esc(c.name)}<span class="o">O${c.onda}</span></a>`).join('')}</div>`;
}

// ---- diagnóstico
const DIAG_TARGET = 7200;
V.diag = () => {
  const D = S.diag;
  if (D.score !== undefined && D.step === 'result') return diagResult();
  if (D.step === 'sabia') return diagSabia();
  if (D.step === 'run') return diagRun();
  setView(`
    <div><div class="eyebrow">Etapa 1</div><h1 class="v">Diagnóstico: <em>onde você está</em></h1></div>
    <p class="lede">São 40 questões reais do ENEM, duas de cada padrão, misturadas como numa prova. Elas não aparecem em outra parte do material. No fim, a plataforma corrige, pinta o semáforo e monta a sua trilha.</p>
    <div class="cgrid">
      <div class="panel"><h3 class="v">Regras</h3><ul class="small" style="padding-left:18px;margin:8px 0 0">
        <li>Cerca de <b>2 horas</b>. O cronômetro pausa se você sair da página.</li><li>Sem consulta e sem calculadora, como no ENEM.</li>
        <li>Não deixe questão em branco: chute e marque <b>“Estou em dúvida”</b>.</li><li>Pode voltar a qualquer questão antes de entregar.</li></ul></div>
      <div class="panel"><h3 class="v">Por que a dúvida conta como erro</h3><p class="small" style="margin:8px 0 0">O diagnóstico quer saber o que você domina, não o que deu sorte. Um acerto com dúvida é um erro que ainda não aconteceu, e é ele que o estudo das próximas semanas precisa resolver.</p></div>
      <div class="panel"><h3 class="v">O que você recebe</h3><p class="small" style="margin:8px 0 0">Sua trilha (Base, Avanço ou 40+), o semáforo dos 20 padrões, a fila de estudo em ordem de prioridade, o tempo que falta e a data prevista de término.</p></div>
    </div>
    <div class="row"><button class="btn lime" data-act="diag-start">${Object.keys(D.ans).length ? 'Continuar o diagnóstico' : 'Começar agora'}</button>
      <span class="small muted">${Object.keys(D.ans).length ? `${Object.keys(D.ans).length} de 40 respondidas · ${clock(D.el)} de prova` : 'As imagens carregam aos poucos; deixe a página aberta.'}</span></div>`);
};
function diagRun() {
  loadPack('img_diag').catch(() => {});
  const D = S.diag;
  setView(runner({ ids: META.diag, st: D, title: 'Diagnóstico', sub: 'Etapa 1 · 40 questões', target: DIAG_TARGET, labelFn: k => 'D' + String(k + 1).padStart(2, '0') }), () => startTick(D));
}
function diagSabia() {
  const { ok, per } = diagScore();
  const list = CH.filter(c => per[c.id].ok < 2);
  const D = S.diag;
  const rows = list.map(c => {
    const idx = per[c.id].idx;
    const qs = idx.map(i => { const id = META.diag[i], q = Q[id], a = D.ans[i]; return `D${String(i + 1).padStart(2, '0')}: você marcou ${a || '—'}${D.dbt[i] ? ' (dúvida)' : ''}, gabarito ${q.g}`; }).join(' · ');
    const v = D.sabia[c.id];
    return `<div class="item" style="padding:14px 16px"><div class="row"><span class="dot ${colorOf(per[c.id].ok)}"></span><b style="color:var(--navy);font-size:15.5px">${esc(c.name)}</b>
      <span class="dtag ${c.d}">${DSHORT[c.d]}</span><span class="muted small">${esc(c.what)}</span></div>
      <div class="small muted" style="margin:6px 0 10px">${qs} · <a href="#" data-act="diag-peek" data-c="${c.id}">ver as questões</a></div>
      <div class="peek" data-peek="${c.id}"></div>
      <div class="row"><span class="small" style="font-weight:700">Ao ver a resposta certa, você já sabia esse conteúdo?</span>
        <button class="btn sm ${v === true ? '' : 'ghost'}" data-act="sabia" data-c="${c.id}" data-v="1">Sim, já sabia</button>
        <button class="btn sm ${v === false ? '' : 'ghost'}" data-act="sabia" data-c="${c.id}" data-v="0">Não sabia</button></div></div>`;
  }).join('');
  const pending = list.filter(c => D.sabia[c.id] === undefined).length;
  setView(`
    <div><div class="eyebrow">Etapa 1 · quase lá</div><h1 class="v">Você acertou <em>${ok} de 40</em></h1></div>
    <p class="lede">Falta uma resposta para cada padrão em que você errou ou ficou em dúvida. Ela decide por onde você começa: pela teoria (se não sabia o conteúdo) ou direto pelo capítulo do padrão (se sabia, mas errou).</p>
    <div class="queue">${rows || '<div class="panel">Você acertou as duas questões de todos os padrões. Sua trilha vai focar em simulados.</div>'}</div>
    <div class="row"><button class="btn lime" data-act="diag-build" ${pending ? 'disabled' : ''}>Gerar minha trilha</button>
      <span class="small muted">${pending ? `Faltam ${pending} respostas.` : 'Tudo pronto.'}</span></div>`);
}
function diagResult() {
  const T = TRILHAS[S.trilha], p = plan();
  const rows = S.fila.map((it, k) => `<tr><td class="tnum">${k + 1}</td><td><span class="dot ${it.color}"></span> <a href="#p-${it.cid}"><b>${esc(CHI[it.cid].name)}</b></a></td>
    <td><span class="badge ${it.prio.toLowerCase()}">${it.prio}</span></td><td>${it.rota === 'T' ? 'Teoria primeiro' : 'Padrão direto'}</td><td class="tnum">${hm(it.steps.reduce((a, s) => a + STEP[s].m, 0))}</td></tr>`).join('');
  setView(`
    <div><div class="eyebrow">Resultado do diagnóstico</div><h1 class="v">${T.name}: <em>${S.diag.score}/40</em></h1></div>
    <section class="hero stack"><p class="lede" style="color:#fff;font-weight:600">${T.text}</p>
      <div class="flow3"><div><b>${S.fila.length}</b>padrões na sua fila</div><div><b>${hm(p.rem)}</b>de estudo, incluindo ${T.sims.length} simulados</div>
      <div><b>${p.rem ? fmt(p.end) : '—'}</b>término previsto com ${p.hpw} h por semana</div></div>
      <div class="row"><a class="btn lime" href="#trilha">Abrir minha trilha</a><a class="btn ghost" href="#diag-rev" style="color:#fff">Revisar as 40 questões</a></div></section>
    <section class="panel stack"><h2 class="v">Semáforo</h2>${semaBoard()}<p class="small muted" style="margin:0">Vermelho: errou as duas. Amarelo: acertou uma. Verde: acertou as duas sem dúvida.</p></section>
    <section class="panel stack"><h2 class="v">Sua fila de estudo</h2>
      <p class="small muted" style="margin:0">P1: vermelho em padrão que cai muito. P2: amarelos das Ondas 1 e 2 e vermelhos da Onda 3. P3: amarelos da Onda 3. Verdes ficam de fora e são mantidos pelos simulados.</p>
      <div class="tw"><table class="ui"><tr><th>#</th><th>Padrão</th><th>Prioridade</th><th>Começo</th><th>Tempo</th></tr>${rows}</table></div></section>`);
}
V['diag-rev'] = () => {
  if (S.diag.score === undefined) return go('diag');
  const D = S.diag;
  const grid = META.diag.map((id, i) => `<button class="${D.ans[i] === Q[id].g && !D.dbt[i] ? 'right' : 'wrong'}" data-act="scroll" data-t="dq${i}">D${String(i + 1).padStart(2, '0')}</button>`).join('');
  setView(`<div class="crumb"><a href="#diag">← Resultado</a></div><div><div class="eyebrow">Diagnóstico</div><h1 class="v">Revisão das <em>40 questões</em></h1></div>
    <div class="panel"><div class="qgrid">${grid}</div></div>
    ${META.diag.map((id, i) => `<div id="dq${i}">${qCard(id, { mode: 'review', mine: D.ans[i], dbt: D.dbt[i], label: 'D' + String(i + 1).padStart(2, '0') })}</div>`).join('')}`);
};

// ---- trilha
V.trilha = () => {
  if (S.diag.score === undefined) return setView(`<div><div class="eyebrow">Minha trilha</div><h1 class="v">Sua trilha começa no <em>diagnóstico</em></h1></div>
    <p class="lede">Faça o diagnóstico de 40 questões. A trilha, a fila e a previsão de término aparecem aqui automaticamente.</p><div><a class="btn lime" href="#diag">Ir para o diagnóstico</a></div>`);
  const p = plan(), T = TRILHAS[S.trilha];
  const items = S.fila.map((it, k) => {
    const c = CHI[it.cid]; const dn = itemDone(it); const cut = S.cutP3 && it.prio === 'P3' && !dn;
    const doneN = it.steps.filter(s => it.done[s]).length;
    const remM = it.steps.filter(s => !it.done[s]).reduce((a, s) => a + STEP[s].m, 0);
    return `<details class="item ${dn ? 'done' : ''}" ${!dn && !cut && k < 3 ? 'open' : ''} style="${cut ? 'opacity:.45' : ''}"><summary><span class="n">${k + 1}</span>
      <span class="dot ${it.color}"></span><span class="nm">${esc(c.name)}</span>
      <span class="meta"><span class="badge ${it.prio.toLowerCase()}">${it.prio}</span><span class="badge">${it.rota === 'T' ? 'Teoria primeiro' : 'Padrão direto'}</span>
      ${cut ? '<span class="badge">cortado</span>' : `<span class="small muted tnum">${doneN}/${it.steps.length} · ${dn ? 'concluído' : 'faltam ' + hm(remM)}</span>`}</span></summary>
      <div class="stepl">${it.steps.map(s => `<div class="step"><input type="checkbox" id="st-${it.cid}-${s}" data-act="step" data-c="${it.cid}" data-k="${s}" ${it.done[s] ? 'checked' : ''}>
        <label for="st-${it.cid}-${s}">${STEP[s].l}</label><span class="m">${hm(STEP[s].m)}</span><a class="btn sm ghost" href="${STEP[s].to(it.cid)}">Abrir</a></div>`).join('')}
        ${it.origin !== 'diagnóstico' ? `<p class="small muted" style="margin:8px 0 0">Entrou na fila pelo ${esc(it.origin)}.</p>` : ''}</div></details>`;
  }).join('');
  const sims = T.sims.map(k => { const r = S.sims[k]; const d = SIMDEF[k];
    return `<div class="step"><span class="dot ${r && r.done ? 'g' : ''}"></span><label><b>${d.name}</b> · ${d.sub}${r && r.done ? ` · <b>${r.score}/${simIds(k).length}</b>` : ''}</label><span class="m">${hm(d.m)}</span><a class="btn sm ${r && r.done ? 'ghost' : ''}" href="#sim-${k}">${r && r.done ? 'Ver resultado' : r && r.started ? 'Continuar' : 'Fazer'}</a></div>`; }).join('');
  const st = { done: ['ok', 'Trilha concluída'], ok: ['ok', 'No prazo'], late: ['warn', 'Atenção ao prazo'], over: ['bad', 'Prazo encerrado'] }[p.status];
  const hasP3 = S.fila.some(i => i.prio === 'P3' && !itemDone(i));
  const finalWeek = [['Seg · 9/11', 'Caderno de erros inteiro, só lendo. Marque os 10 erros que mais se repetiram.'], ['Ter · 10/11', 'Onda 1: gatilhos e boxes “O que levar dessa questão” dos capítulos 01 a 07.'],
    ['Qua · 11/11', 'Onda 2 e o protocolo da conta (Parte 2). Refaça 3 contas que você errou nos simulados.'], ['Qui · 12/11', 'Onda 3 e “A ideia em uma frase” dos resumos dos seus padrões P1.'],
    ['Sex · 13/11', 'Estratégia de prova (Parte 4): duas voltas, quando pular, ordem de leitura.'], ['Sáb · 14/11', 'Nada de questões. Documento, caneta preta de tubo transparente, trajeto e horário.']];
  setView(`
    <div><div class="eyebrow">Minha trilha · ${T.rng}</div><h1 class="v">${T.name}</h1></div>
    <section class="panel navy stack">
      <div class="row" style="align-items:flex-start;gap:24px">
        <div><div class="eyebrow" style="color:#AFC0E3">Falta</div><div class="big40" style="font-size:52px">${hm(p.rem)}</div><div class="small muted">de ${hm(p.tot)} no total · ${p.pct}% feito</div></div>
        <div><div class="eyebrow" style="color:#AFC0E3">Término previsto</div><div class="big40" style="font-size:52px;color:#fff">${p.rem ? fmt(p.end) : '✓'}</div><div><span class="badge ${st[0]}">${st[1]}</span></div></div>
        <div style="flex:1;min-width:220px" class="stack"><label for="hpw" class="eyebrow" style="color:#AFC0E3">Horas por semana para Natureza: <b style="color:#fff" id="hpwv">${p.hpw} h</b></label>
          <input type="range" id="hpw" min="2" max="20" step="1" value="${p.hpw}" data-act="hpw" style="width:100%;accent-color:#D6FF00">
          <div class="small muted">${p.rem ? `Data-limite da trilha: ${fmt(DEADLINE)}. ${p.left > 0 ? `Para chegar até lá, são <b style="color:#fff">${Math.ceil(p.need)} h por semana</b>.` : ''}` : 'Tudo feito. Mantenha os simulados e o banco.'}</div></div>
      </div>
      <div class="pbar" style="background:#24396A"><i style="width:${p.pct}%;background:var(--lime)"></i></div>
      ${hasP3 ? `<label class="dbt" style="color:#fff"><input type="checkbox" data-act="cutp3" ${S.cutP3 ? 'checked' : ''}> Cortar os itens P3 (amarelos da Onda 3) para caber no prazo</label>` : ''}
    </section>
    <p class="small muted" style="margin:-6px 0 0">A previsão soma o tempo de cada etapa que falta e os simulados ainda não feitos, dividido pelas horas por semana. Depois de ${fmt(DEADLINE)} vêm a pausa do 1º dia (${fmt(DAY1)}) e a semana de revisão.</p>
    <section class="stack"><h2 class="v">Fila de estudo</h2><p class="small muted" style="margin:-6px 0 0">Siga na ordem. Marque cada etapa ao terminar; o treino e os exercícios do resumo se marcam sozinhos quando você responde todas as questões.</p>
      <div class="queue">${items || '<div class="panel">Sua fila está vazia: todos os padrões ficaram verdes. Foque nos simulados e no banco.</div>'}</div></section>
    <section class="panel stack"><h2 class="v">Simulados</h2><p class="small muted" style="margin:0">Provas oficiais que não aparecem no material. Depois de cada uma, a plataforma corrige, conta os erros por padrão e ajusta a sua fila.</p><div class="stepl" style="border:0;padding:0">${sims}</div></section>
    <section class="panel stack"><h2 class="v">Semana da prova</h2><p class="small muted" style="margin:0">Só revisão, até 1 hora por dia. Domingo, 15/11: Natureza e Matemática.</p>
      <div class="stepl" style="border:0;padding:0">${finalWeek.map(([d, t], k) => `<div class="step"><input type="checkbox" id="fw${k}" data-act="fw" data-k="${k}" ${S.rev[k] ? 'checked' : ''}><label for="fw${k}"><b>${d}</b> · ${t}</label></div>`).join('')}</div></section>
    <section class="panel stack"><h2 class="v">Sua conta</h2>
      <p class="small muted" style="margin:0">Você entrou como <b>${esc(USER.email || '')}</b>. O progresso fica salvo na sua conta e aparece em qualquer aparelho.</p>
      <div class="row"><button class="btn sm ghost" data-act="logout">Sair da conta</button><button class="btn sm danger" data-act="reset-ask">Refazer o diagnóstico</button></div>
      <div id="bkbox"></div></section>`);
};

// ---- padrões
V.padroes = () => {
  const acc = accuracy();
  const card = c => { const a = acc[c.id]; return `<a class="ccard" href="#p-${c.id}"><div class="t"><span class="dot ${S.sem[c.id] || ''}"></span><b>${esc(c.name)}</b><i>${c.id.slice(1)}</i></div>
    <div class="row" style="gap:6px"><span class="dtag ${c.d}">${DNAME[c.d]}</span><span class="badge">${String(c.avg).replace('.', ',')} por prova</span></div><p>${esc(c.what)}</p>
    ${a && a.n ? `<p class="small"><b>${Math.round(a.ok / a.n * 100)}%</b> de acerto em ${a.n} questões</p>` : ''}</a>`; };
  setView(`<div><div class="eyebrow">Parte 3</div><h1 class="v">Os 20 <em>padrões</em></h1></div>
    <p class="lede">Os capítulos estão em três ondas, ordenadas pela média de questões por prova. A cor é o seu semáforo; cada capítulo tem o padrão explicado, questões-modelo resolvidas, treino com correção e um tutor de IA.</p>
    ${[1, 2, 3].map(o => `<section class="stack"><h2 class="v">Onda ${o}</h2><div class="cgrid">${CH.filter(c => c.onda === o).map(card).join('')}</div></section>`).join('')}`);
};
const CONTENT = {};
async function getContent(key) {
  if (!CONTENT[key]) CONTENT[key] = fetch(`data/${key}.html`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).catch(e => { delete CONTENT[key]; throw e; });
  return CONTENT[key];
}
function prepDoc(root) {
  root.querySelectorAll('table').forEach(t => { if (!t.parentElement.classList.contains('tw')) { const w = document.createElement('div'); w.className = 'tw'; t.replaceWith(w); w.append(t); } });
}
function readerShell(crumb, side) {
  return `<div class="crumb">${crumb}</div><article class="reader"><div class="doc" id="doc"><div class="empty">Carregando o capítulo…</div></div></article>${side || ''}`;
}
async function fillDoc(key, after) {
  const el = document.getElementById('doc');
  try { const h = await getContent(key); if (!document.getElementById('doc')) return; el.innerHTML = h; prepDoc(el); hydrate(el); after && after(el); }
  catch (e) { el.innerHTML = '<div class="empty">Não foi possível carregar este capítulo. Verifique a conexão e tente de novo.</div>'; }
}
function tutorBox(kind, cid) {
  return `<section class="ai" data-tutor="${kind}:${cid}"><div class="h">${AI_ICON}Tutor de IA deste ${kind === 'p' ? 'padrão' : 'conteúdo'}</div>
    <div class="small muted">Pergunte o que não ficou claro. O tutor lê este capítulo e responde no nível do ENEM.</div>
    <div class="chat"></div>
    <div class="row"><input type="text" id="tut-in" placeholder="Ex.: qual a diferença entre ${kind === 'p' ? 'os distratores N e V neste padrão' : 'os dois processos do item 2'}?" style="flex:1;min-width:200px">
      <button class="btn sm" data-act="tutor-send">Perguntar</button><button class="btn sm ghost" data-act="tutor-stop" hidden>Parar</button></div>
    <div class="row" style="gap:6px">${(kind === 'p' ? ['Resuma este padrão em 5 linhas', 'Me faça 3 perguntas rápidas sobre este padrão', 'Quais pegadinhas mais caem aqui?'] : ['Explique de novo, mais simples', 'Me faça 3 perguntas rápidas sobre este conteúdo', 'Qual a fórmula ou ideia mais cobrada?']).map(s => `<button class="btn sm ghost" data-act="tutor-quick" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></section>`;
}
V.p = (cid, sub) => {
  const c = CHI[cid]; if (!c) return go('padroes');
  const tre = META.treino[cid] || [];
  const it = S.fila.find(x => x.cid === cid);
  const side = `<section class="stack" id="treino"><h2 class="v">Treino do padrão</h2>
      <p class="small muted" style="margin:-6px 0 0">Questões reais com o comentário do material depois de responder. Use o método: gatilho → comando reformulado → conceito → eliminação.</p>
      ${tre.map((id, k) => `<div data-ctxwrap>${qCard(id, { label: 'T' + (k + 1) })}</div>`).join('')}
      <div class="row"><a class="btn" href="#banco" data-act="bank-pat" data-c="${cid}">Praticar mais questões deste padrão no banco</a></div></section>
    ${tutorBox('p', cid)}`;
  const crumb = `<a href="#padroes">← Padrões</a><span class="muted">/</span><span>${esc(c.name)}</span>
    <span style="margin-left:auto" class="row">${it ? `<span class="badge ${it.prio.toLowerCase()}">${it.prio} na sua fila</span>` : ''}<a class="btn sm ghost" href="#t-${cid}">Embasamento teórico</a></span>`;
  setView(readerShell(crumb, side), () => {
    fillDoc('p_' + cid, () => { if (sub === 'treino') document.getElementById('treino').scrollIntoView(); });
  });
};
V.teoria = () => {
  setView(`<div><div class="eyebrow">Parte 5</div><h1 class="v">Embasamento <em>teórico</em></h1></div>
    <p class="lede">Cada conteúdo explicado do zero, com figuras, os erros que o ENEM explora e 10 exercícios resolvidos: 3 diretos, 5 contextualizados e 2 de aprofundamento.</p>
    ${['B', 'Q', 'F'].map(d => `<section class="stack"><h2 class="v">${DNAME[d]}</h2><div class="cgrid">${META.teoOrder[d].map(cid => { const t = META.teo[cid], s = S.teo[cid];
      return `<a class="ccard" href="#t-${cid}"><div class="t"><span class="dtag ${d}">${t.code}</span><b style="font-size:16px">${esc(t.title)}</b></div><p>Base do padrão ${esc(CHI[cid].name)}</p>${s && s.n ? `<p class="small"><b>${s.n}/10</b> exercícios feitos</p>` : ''}</a>`; }).join('')}</div></section>`).join('')}`);
};
V.t = (cid, sub) => {
  const c = CHI[cid]; if (!c) return go('teoria'); const t = META.teo[cid];
  const crumb = `<a href="#teoria">← Teoria</a><span class="muted">/</span><span>${esc(t.title)}</span><a class="btn sm ghost" style="margin-left:auto" href="#p-${cid}">Padrão ${esc(c.name)}</a>`;
  setView(readerShell(crumb, tutorBox('t', cid)), () => fillDoc('t_' + cid, el => { wireExercises(el, cid); if (sub === 'ex') { const f = el.querySelector('.exq'); if (f) (f.previousElementSibling || f).scrollIntoView(); } }));
};
function wireExercises(root, cid) {
  const st = S.teo[cid] = S.teo[cid] || { a: 0, dc: 0, n: 0, picks: {} };
  root.querySelectorAll('.exq').forEach((q, k) => {
    const r = q.nextElementSibling && q.nextElementSibling.classList.contains('exr') ? q.nextElementSibling : null;
    if (!r) return;
    const g = ((r.querySelector('.rg') || {}).textContent || '').replace(/.*:\s*/, '').trim();
    const kind = q.classList.contains('exa') ? 'A' : 'DC';
    const btn = document.createElement('button'); btn.className = 'btn sm ghost rvbtn'; btn.textContent = 'Ver resolução';
    const show = () => { r.classList.remove('hid'); btn.remove(); };
    btn.onclick = show;
    const picked = st.picks[k];
    if (picked) { mark(picked); } else { r.classList.add('hid'); r.before(btn); }
    q.querySelectorAll('.xa').forEach(a => a.addEventListener('click', () => {
      if (st.picks[k]) return;
      const L = (a.querySelector('b') || {}).textContent;
      st.picks[k] = L; st.n++; if (kind === 'A') st.a++; else st.dc++;
      save(); mark(L); show(); autoCredit(cid);
    }));
    function mark(L) {
      q.querySelectorAll('.xa').forEach(a => { const l = (a.querySelector('b') || {}).textContent; if (l === g) a.classList.add('pick-ok', 'is-ans'); else if (l === L) a.classList.add('pick-no'); });
    }
  });
}
V.g = (key) => {
  const names = { comecar: 'Antes de começar', p1: 'O mapa da prova', p2: 'O método', p4: 'Do treino à nota', ficha: 'Os padrões em uma página' };
  if (!names[key]) return go('guia');
  setView(readerShell(`<a href="#guia">← Guia</a><span class="muted">/</span><span>${names[key]}</span>`), () => fillDoc('g_' + key));
};
V.guia = () => {
  const items = [['comecar', 'Antes de começar', 'Como usar o material e ler as resoluções.'], ['p1', 'O mapa da prova', 'Quantas questões cada padrão vale e os seis tipos de cobrança.'],
    ['p2', 'O método', 'Reformular o comando, traduzir o contexto, a Regra da Origem, os seis distratores e o protocolo da conta.'],
    ['p4', 'Do treino à nota', 'Correção por alternativa, diagnóstico do erro, caderno de erros e estratégia de prova.'], ['ficha', 'Os padrões em uma página', 'A ficha-resumo para revisar na véspera.']];
  setView(`<div><div class="eyebrow">Partes 1, 2 e 4</div><h1 class="v">Guia e <em>método</em></h1></div>
    <div class="cgrid">${items.map(([k, t, d]) => `<a class="ccard" href="#g-${k}"><div class="t"><b>${t}</b></div><p>${d}</p></a>`).join('')}</div>`);
};

// ---- banco
let BF = { d: '', c: '', y: '', a: '', m: '', s: 'todas', i: 0 };
function lockedIds() {
  const lock = new Set();
  const sims = S.trilha ? TRILHAS[S.trilha].sims : ['A', 'B', 'C'];
  for (const k of sims) if (!(S.sims[k] && S.sims[k].done)) for (const id of simIds(k)) lock.add(id);
  if (S.diag.score === undefined) for (const id of META.diag) lock.add(id);
  return lock;
}
function bankList() {
  const lock = lockedIds();
  return META.q.filter(q => !lock.has(q.id) && 'ABCDE'.includes(q.g) && (!BF.d || q.d === BF.d) && (!BF.c || q.c === BF.c) && (!BF.y || q.e.slice(0, 2) === BF.y) && (!BF.a || q.e[2] === BF.a) && (!BF.m || q.m === BF.m)
    && (BF.s === 'todas' || (BF.s === 'novas' && !S.bank[q.id]) || (BF.s === 'erradas' && S.bank[q.id] && !S.bank[q.id].ok) || (BF.s === 'duvida' && S.bank[q.id] && S.bank[q.id].d)));
}
V.banco = () => {
  const L = bankList(); const lock = lockedIds();
  const sel = (id, lab, opts, val) => `<label>${lab}<select id="${id}" data-act="bf" data-f="${id.slice(3)}">${opts.map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const done = Object.keys(S.bank).length, ok = Object.values(S.bank).filter(r => r.ok).length;
  const cur = Math.min(BF.i, Math.max(0, L.length - 1));
  const list = L.slice(0, 200).map((q, k) => { const r = S.bank[q.id]; return `<button data-act="bk-open" data-i="${k}"><span class="dot ${r ? (r.ok && !r.d ? 'g' : r.ok ? 'y' : 'r') : ''}"></span><span class="id">${exLabel(q.e).replace('ENEM ', '')} · Q${q.n}</span><span class="dtag ${q.d}">${DSHORT[q.d]}</span><span class="th">${esc(CHI[q.c].name)}${q.t ? ' · ' + esc(q.t) : ''}</span></button>`; }).join('');
  setView(`<div><div class="eyebrow">Banco de questões</div><h1 class="v">720 questões <em>reais</em></h1></div>
    <div class="tiles"><div class="tile"><div class="k">Resolvidas</div><div class="v">${done}</div><div class="s">no banco e nos treinos</div></div>
      <div class="tile"><div class="k">Acerto</div><div class="v">${done ? Math.round(ok / done * 100) : 0}%</div><div class="s">${ok} certas</div></div>
      <div class="tile"><div class="k">Neste filtro</div><div class="v">${L.length}</div><div class="s">${lock.size ? `${lock.size} reservadas para o diagnóstico e os simulados` : 'todas liberadas'}</div></div></div>
    <section class="panel stack"><div class="filters">
      ${sel('bf-d', 'Disciplina', [['', 'Todas'], ['B', 'Biologia'], ['Q', 'Química'], ['F', 'Física']], BF.d)}
      ${sel('bf-c', 'Padrão', [['', 'Todos']].concat(CH.map(c => [c.id, c.name])), BF.c)}
      ${sel('bf-y', 'Ano', [['', 'Todos']].concat(['18', '19', '20', '21', '22', '23', '24', '25'].map(y => [y, '20' + y])), BF.y)}
      ${sel('bf-a', 'Aplicação', [['', 'Todas'], ['R', 'Regular'], ['P', 'PPL']], BF.a)}
      ${sel('bf-m', 'Cobrança', [['', 'Todas']].concat(Object.entries(COB)), BF.m)}
      ${sel('bf-s', 'Situação', [['todas', 'Todas'], ['novas', 'Não resolvidas'], ['erradas', 'Erradas'], ['duvida', 'Com dúvida']], BF.s)}
    </div></section>
    ${L.length ? `<div class="cols2 bank"><div id="bkq">${qCard(L[cur].id, { label: `${cur + 1}/${L.length}` })}
      <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="bk-nav" data-d="-1" ${cur === 0 ? 'disabled' : ''}>← Anterior</button><button class="btn sm" data-act="bk-nav" data-d="1" style="margin-left:auto" ${cur >= L.length - 1 ? 'disabled' : ''}>Próxima →</button></div></div>
      <div class="stack"><h3 class="v">Questões do filtro</h3><div class="qlist">${list}</div>${L.length > 200 ? '<p class="small muted">Mostrando as 200 primeiras. Refine o filtro.</p>' : ''}</div></div>`
    : '<div class="panel empty">Nenhuma questão neste filtro.</div>'}`);
};

// ---- simulados
V.sim = (k) => {
  if (!k) {
    const plan = S.trilha ? TRILHAS[S.trilha].sims : ['A', 'B', 'C'];
    const all = ['A', 'B', 'C', 'A1', 'A2'];
    const card = key => { const d = SIMDEF[key], r = S.sims[key]; return `<div class="panel stack"><div class="row"><h3 class="v">${d.name}</h3>${plan.includes(key) ? '<span class="badge ok" style="margin-left:auto">Na sua trilha</span>' : ''}</div>
      <div class="muted small">${d.sub} · ${simIds(key).length} questões · cerca de ${hm(simIds(key).length * 3)}</div>
      ${r && r.done ? `<div><b>${r.score}/${simIds(key).length}</b> acertos sem dúvida · ${clock(r.el)}</div>` : ''}
      <div><a class="btn sm ${r && r.done ? 'ghost' : ''}" href="#sim-${key}">${r && r.done ? 'Ver resultado' : r && r.started ? 'Continuar' : 'Começar'}</a></div></div>`; };
    return setView(`<div><div class="eyebrow">Simulados</div><h1 class="v">Provas oficiais, <em>cronometradas</em></h1></div>
      <p class="lede">Nenhuma questão destas provas aparece no material, então o resultado mede você, não a sua memória. Ao entregar, a plataforma corrige, conta os erros por padrão e ajusta a sua fila: 2 ou mais erros no mesmo padrão fazem ele subir na fila ou voltar para ela.</p>
      <div class="cgrid">${all.map(card).join('')}</div>`);
  }
  const d = SIMDEF[k]; if (!d) return go('sim');
  const r = S.sims[k] = S.sims[k] || { ans: {}, dbt: {}, cur: 0, el: 0 };
  if (r.done) return simResult(k);
  if (!r.started) return setView(`<div class="crumb"><a href="#sim">← Simulados</a></div><div><div class="eyebrow">${d.sub}</div><h1 class="v">${d.name}</h1></div>
    <p class="lede">${simIds(k).length} questões, cerca de ${hm(simIds(k).length * 3)}. Faça de uma vez, sem consulta, marcando “Estou em dúvida” quando chutar. O cronômetro pausa se você sair da página.</p>
    <div><button class="btn lime" data-act="sim-start" data-k="${k}">Começar o simulado</button></div>`);
  const ids = simIds(k);
  setView(runner({ ids, st: r, title: d.name, sub: d.sub, target: ids.length * 180, labelFn: i => String(SIMDEF[k].a + i) }), () => startTick(r));
};
function finishSim(k) {
  const r = S.sims[k], ids = simIds(k);
  const per = {}; let score = 0;
  ids.forEach((id, i) => { const q = Q[id]; const hit = r.ans[i] === q.g && !r.dbt[i]; if (hit) score++; const p = per[q.c] = per[q.c] || { n: 0, err: 0 }; p.n++; if (!hit) p.err++; });
  r.done = true; r.score = score; r.per = per; r.at = Date.now();
  const tq = r.tq || {};
  logAnswers(ids.map((id, i) => ({ qid: id, source: 'simulado', letter: r.ans[i] || null, correct: r.ans[i] === Q[id].g, doubt: !!r.dbt[i], seconds: tq[i] ? Math.min(7200, Math.round(tq[i])) : null })));
  ids.forEach((id, i) => { if (r.ans[i] !== Q[id].g || r.dbt[i]) registerMiss(id, 'simulado', r.ans[i], r.dbt[i]); });
  const changes = [];
  if (S.trilha) {
    for (const cid in per) {
      const p = per[cid], c = CHI[cid];
      const it = S.fila.find(x => x.cid === cid);
      if (p.err >= 2) {
        if (it && !itemDone(it)) {
          if (it.prio !== 'P1') { const old = it.prio; it.prio = it.prio === 'P3' ? 'P2' : 'P1'; changes.push(`${c.name}: subiu de ${old} para ${it.prio} (${p.err} erros).`); }
        } else if (it && itemDone(it)) {
          for (const s of ['tre']) it.done[s] = false; it.prio = 'P2'; it.origin = d(k);
          changes.push(`${c.name}: voltou para a fila com um novo treino (${p.err} erros).`);
        } else {
          S.fila.push({ cid, prio: 'P2', color: 'y', rota: 'P', steps: stepsFor('P', S.trilha), done: {}, origin: d(k) });
          changes.push(`${c.name}: entrou na fila como P2 (${p.err} erros).`);
        }
        if (S.sem[cid] === 'g') S.sem[cid] = 'y'; else if (S.sem[cid] === 'y' && p.err >= 3) S.sem[cid] = 'r';
      } else if (p.err === 0 && p.n >= 2) {
        if (S.sem[cid] === 'r') S.sem[cid] = 'y'; else if (S.sem[cid] === 'y') S.sem[cid] = 'g';
      }
    }
    sortFila();
  }
  function d(x) { return SIMDEF[x].name; }
  r.changes = changes; save(true);
}
function simResult(k) {
  const d = SIMDEF[k], r = S.sims[k], ids = simIds(k);
  const rows = Object.entries(r.per).sort((a, b) => b[1].err - a[1].err || CHI[a[0]].i - CHI[b[0]].i)
    .map(([cid, p]) => `<tr><td><span class="dot ${S.sem[cid] || ''}"></span> <a href="#p-${cid}"><b>${esc(CHI[cid].name)}</b></a></td><td class="tnum">${p.n}</td><td class="tnum" style="${p.err >= 2 ? 'color:var(--red-ink);font-weight:800' : ''}">${p.err}</td></tr>`).join('');
  const grid = ids.map((id, i) => `<button class="${r.ans[i] === Q[id].g && !r.dbt[i] ? 'right' : 'wrong'}" data-act="scroll" data-t="sq${i}">${d.a + i}</button>`).join('');
  const wrong = ids.map((id, i) => [id, i]).filter(([id, i]) => !(r.ans[i] === Q[id].g && !r.dbt[i]));
  const tq = r.tq || {}, hasT = Object.keys(tq).length > 0;
  const slow = ids.map((id, i) => [id, i, tq[i] || 0]).filter(x => x[2] >= 240).sort((a, b) => b[2] - a[2]);
  const skip = ids.map((id, i) => [id, i, tq[i] || 0]).filter(([id, i, t]) => t >= 180 && !(r.ans[i] === Q[id].g && !r.dbt[i]));
  const timeBox = hasT ? `<section class="panel stack"><h2 class="v">Tempo por questão</h2>
      <p class="small muted" style="margin:0">Meta do ENEM: cerca de 3 minutos por questão, deixando tempo para Matemática.</p>
      <div class="row"><span class="badge">${slow.length} acima de 4 min</span><span class="badge ${skip.length ? 'warn' : 'ok'}">${skip.length} para pular na 1ª volta</span></div>
      ${skip.length ? `<p style="margin:0"><b>Deveria ter pulado na primeira volta:</b> você gastou mais de 3 minutos e errou. Na prova, marque e volte no fim.</p><div class="chips2">${skip.map(([id, i, t]) => `<button class="chip2" data-act="scroll" data-t="sq${i}">Q${d.a + i} · ${Math.round(t / 60)} min</button>`).join('')}</div>` : '<p style="margin:0">Você não perdeu tempo demais em questões que errou.</p>'}
      ${slow.length ? `<div class="small muted">Mais demoradas: ${slow.slice(0, 6).map(([id, i, t]) => `Q${d.a + i} (${Math.round(t / 60)} min${r.ans[i] === Q[id].g && !r.dbt[i] ? ', acertou' : ', errou'})`).join(' · ')}</div>` : ''}</section>` : '';
  setView(`<div class="crumb"><a href="#sim">← Simulados</a></div><div><div class="eyebrow">${d.sub}</div><h1 class="v">${d.name}: <em>${r.score}/${ids.length}</em></h1></div>
    <div class="tiles"><div class="tile"><div class="k">Acertos sem dúvida</div><div class="v">${r.score}</div><div class="s">de ${ids.length}</div></div>
      <div class="tile"><div class="k">Tempo</div><div class="v">${clock(r.el)}</div><div class="s">${Math.round(r.el / ids.length / 60 * 10) / 10} min por questão</div></div>
      <div class="tile"><div class="k">A revisar</div><div class="v">${wrong.length}</div><div class="s">erradas ou com dúvida</div></div></div>
    ${r.changes && r.changes.length ? `<div class="chg"><b>Mudanças na sua trilha</b><br>${r.changes.map(esc).join('<br>')}</div>` : (S.trilha ? '<div class="chg">Nenhum padrão teve 2 ou mais erros: sua fila continua a mesma.</div>' : '')}
    <div class="cols2"><section class="panel stack"><h2 class="v">Erros por padrão</h2><div class="tw"><table class="ui"><tr><th>Padrão</th><th>Questões</th><th>Erros</th></tr>${rows}</table></div></section>
      <section class="stack">${aiBox('Análise do simulado com IA', 'O tutor lê seus erros por padrão e o tempo e diz o que fazer antes do próximo simulado.', 'Analisar meu simulado', 'ai-sim', `data-k="${k}"`)}
      <div class="panel"><h3 class="v" style="margin-bottom:10px">Gabarito</h3><div class="qgrid">${grid}</div></div></section></div>
    ${timeBox}
    <section class="stack"><h2 class="v">Correção das erradas e com dúvida</h2>
      ${wrong.map(([id, i]) => `<div id="sq${i}">${qCard(id, { mode: 'review', mine: r.ans[i], dbt: r.dbt[i], label: String(d.a + i) })}</div>`).join('') || '<div class="panel">Nenhuma. Excelente.</div>'}</section>`);
}

// ---- desempenho
function accuracy() {
  const acc = {}; const add = (id, ok) => { const c = Q[id].c; const a = acc[c] = acc[c] || { n: 0, ok: 0 }; a.n++; if (ok) a.ok++; };
  for (const id in S.bank) add(id, S.bank[id].ok && !S.bank[id].d);
  if (S.diag.score !== undefined) META.diag.forEach((id, i) => add(id, S.diag.ans[i] === Q[id].g && !S.diag.dbt[i]));
  for (const k in S.sims) { const r = S.sims[k]; if (r.done) simIds(k).forEach((id, i) => add(id, r.ans[i] === Q[id].g && !r.dbt[i])); }
  return acc;
}
function timeByPattern() {
  const t = {}; const add = (id, s) => { if (!s) return; const c = Q[id].c; const a = t[c] = t[c] || { s: 0, n: 0 }; a.s += s; a.n++; };
  for (const id in S.bank) add(id, S.bank[id].s);
  if (S.diag.tq) META.diag.forEach((id, i) => add(id, S.diag.tq[i]));
  for (const k in S.sims) { const r = S.sims[k]; if (r.done && r.tq) simIds(k).forEach((id, i) => add(id, r.tq[i])); }
  return t;
}
V.desempenho = () => {
  const acc = accuracy(), tbp = timeByPattern();
  const rows = CH.map(c => { const a = acc[c.id]; const pct = a && a.n ? Math.round(a.ok / a.n * 100) : null;
    return `<tr><td><span class="dot ${S.sem[c.id] || ''}"></span> <a href="#p-${c.id}"><b>${esc(c.name)}</b></a></td><td>O${c.onda}</td><td class="tnum">${a ? a.n : 0}</td><td class="tnum">${tbp[c.id] && tbp[c.id].n ? (Math.round(tbp[c.id].s / tbp[c.id].n / 6) / 10).toString().replace('.', ',') + ' min' : '—'}</td>
      <td style="min-width:140px">${pct === null ? '<span class="muted small">sem dados</span>' : `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="pbar" style="flex:1"><i style="width:${pct}%;background:${pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)'}"></i></div><b class="tnum">${pct}%</b></div>`}</td></tr>`; }).join('');
  const sims = Object.entries(S.sims).filter(([, r]) => r.done).sort((a, b) => a[1].at - b[1].at);
  setView(`<div><div class="eyebrow">Desempenho</div><h1 class="v">Onde estão os <em>seus pontos</em></h1></div>
    <div class="tiles"><div class="tile"><div class="k">Diagnóstico</div><div class="v">${S.diag.score !== undefined ? S.diag.score + '/40' : '—'}</div><div class="s">${S.trilha ? TRILHAS[S.trilha].name : 'ainda não feito'}</div></div>
      ${sims.map(([k, r]) => `<div class="tile"><div class="k">${SIMDEF[k].name}</div><div class="v">${r.score}/${simIds(k).length}</div><div class="s">${clock(r.el)}</div></div>`).join('')}
      <div class="tile"><div class="k">Banco e treinos</div><div class="v">${Object.keys(S.bank).length}</div><div class="s">questões resolvidas</div></div></div>
    <section class="panel stack"><h2 class="v">Acerto por padrão</h2><p class="small muted" style="margin:0">Soma diagnóstico, simulados, treinos e banco. Acerto com dúvida conta como erro.</p>
      <div class="tw"><table class="ui"><tr><th>Padrão</th><th>Onda</th><th>Questões</th><th>Tempo médio</th><th>Acerto</th></tr>${rows}</table></div></section>
    ${aiBox('Análise do seu desempenho', 'O tutor cruza seus números com o peso de cada padrão no ENEM e aponta onde estão os pontos mais baratos.', 'Analisar meu desempenho', 'ai-coach')}`);
};

// ---------------------------------------------------------------- coach prompts
function statsText() {
  const acc = accuracy(); const p = S.trilha ? plan() : null;
  const pat = CH.map(c => { const a = acc[c.id]; return `${c.name} (Onda ${c.onda}, ${c.avg} questões/prova): semáforo ${({ r: 'vermelho', y: 'amarelo', g: 'verde' })[S.sem[c.id]] || '—'}, acerto ${a && a.n ? Math.round(a.ok / a.n * 100) + '% em ' + a.n : 'sem dados'}`; }).join('\n');
  const fila = S.fila.map((it, k) => `${k + 1}. ${CHI[it.cid].name} ${it.prio} ${it.rota === 'T' ? 'teoria primeiro' : 'padrão direto'} — ${it.steps.filter(s => it.done[s]).length}/${it.steps.length} etapas`).join('\n');
  const sims = Object.entries(S.sims).filter(([, r]) => r.done).map(([k, r]) => `${SIMDEF[k].name}: ${r.score}/${simIds(k).length}, ${Math.round(r.el / 60)} min; padrões com 2+ erros: ${Object.entries(r.per).filter(([, x]) => x.err >= 2).map(([c]) => CHI[c].name).join(', ') || 'nenhum'}`).join('\n');
  return `Hoje: ${fmtLong(today())}. Prova de Natureza: 15/11/2026.
Trilha: ${S.trilha ? TRILHAS[S.trilha].name : 'sem diagnóstico'}; diagnóstico ${S.diag.score ?? '—'}/40.
${p ? `Falta estudar ${hm(p.rem)}; ritmo ${p.hpw} h/semana; término previsto ${fmt(p.end)}; data-limite da trilha ${fmt(DEADLINE)}.` : ''}
Padrões:
${pat}
Fila:
${fila || '(vazia)'}
Simulados:
${sims || '(nenhum feito)'}`;
}
function coach(box) { runAI(box, { kind: 'coach', mode: 'geral', stats: statsText() }); }
function simCoach(box, k) {
  const r = S.sims[k], ids = simIds(k);
  const errs = ids.map((id, i) => [id, i]).filter(([id, i]) => !(r.ans[i] === Q[id].g && !r.dbt[i]))
    .map(([id, i]) => `Q${Q[id].n}: ${CHI[Q[id].c].name}, ${COB[Q[id].m]}, marcou ${r.ans[i] || '—'}${r.dbt[i] ? ' com dúvida' : ''}, gabarito ${Q[id].g}${Q[id].t ? ', tema: ' + Q[id].t : ''}`).join('\n');
  runAI(box, { kind: 'coach', mode: 'sim', stats: `${SIMDEF[k].name} (${SIMDEF[k].sub}): ${r.score}/${ids.length} acertos sem dúvida, em ${Math.round(r.el / 60)} minutos (meta: até 3 min por questão).\n\nErros e dúvidas:\n${errs || '(nenhum)'}` });
}

// ---------------------------------------------------------------- tutor chat
// Envia ao tutor só o começo do capítulo e os trechos ligados à pergunta (menos texto = custo menor)
const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set('para como qual quais porque sobre entre esse essa isso este esta pela pelo mais menos muito quando onde tambem ainda pode podem deve explique explica resuma faca perguntas rapidas sobre este padrao conteudo'.split(' '));
function relevantExcerpt(docEl, question, max = 3500) {
  const blocks = Array.from(docEl.children).map(el => (el.innerText || '').replace(/\n{2,}/g, '\n').trim()).filter(Boolean);
  if (!blocks.length) return '';
  const words = norm(question).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w));
  const scored = blocks.map((b, i) => { const nb = norm(b); let sc = 0; for (const w of words) if (nb.includes(w)) sc++; return { i, b, sc }; });
  const keep = new Set();
  let size = 0;
  for (let i = 0; i < blocks.length && size < 900; i++) { keep.add(i); size += blocks[i].length; }
  for (const x of scored.filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc || a.i - b.i)) {
    if (keep.has(x.i)) continue;
    if (size + x.b.length > max) continue;
    keep.add(x.i); size += x.b.length;
  }
  for (let i = 0; i < blocks.length && size < max * 0.6; i++) if (!keep.has(i) && size + blocks[i].length <= max) { keep.add(i); size += blocks[i].length; }
  return [...keep].sort((a, b) => a - b).map(i => blocks[i]).join('\n\n').slice(0, max);
}
const CHATS = {};
async function tutorSend(sec, text) {
  if (!text.trim()) return;
  const key = sec.dataset.tutor; const [kind, cid] = key.split(':');
  const turns = CHATS[key] = CHATS[key] || [];
  const chat = sec.querySelector('.chat');
  const docEl = document.getElementById('doc');
  const excerpt = docEl ? relevantExcerpt(docEl, text + ' ' + turns.slice(-3).map(t => t.content).join(' ')) : '';
  const title = kind === 'p' ? `Padrão ${CHI[cid].name} (${CHI[cid].what})` : `${META.teo[cid].title} (base do padrão ${CHI[cid].name})`;
  turns.push({ role: 'user', content: text });
  const u = document.createElement('div'); u.className = 'msg u'; u.textContent = text; chat.append(u);
  const a = document.createElement('div'); a.className = 'msg a'; a.innerHTML = '<p class="think">Pensando…</p>'; chat.append(a); chat.scrollTop = chat.scrollHeight;
  const stop = sec.querySelector('[data-act=tutor-stop]'); stop.hidden = false;
  const ctl = new AbortController(); sec._ctl = ctl;
  try {
    const r = await callAI({ kind: 'tutor', title, excerpt, messages: turns.slice(-6) }, t => { a.innerHTML = md(t); chat.scrollTop = chat.scrollHeight; }, ctl.signal);
    a.innerHTML = md(r); turns.push({ role: 'assistant', content: r });
  } catch (e) {
    if (e && e.text) { a.innerHTML = md(e.text); turns.push({ role: 'assistant', content: e.text }); }
    else { a.innerHTML = `<p class="small muted">${esc(e && e.code === 'cancelled' ? 'Interrompido.' : aiMsg(e))}</p>`; turns.pop(); }
  } finally { stop.hidden = true; }
}

// ---------------------------------------------------------------- estudo do dia, revisão espaçada e caderno de erros
const dstr = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addDays = n => { const d = today(); d.setDate(d.getDate() + n); return dstr(d); };
const fmtD = s => { const [y, m, d] = s.split('-'); return `${d}/${m}`; };
function addStudy(min) { if (!(min > 0)) return; const k = dstr(); S.day[k] = Math.round(((S.day[k] || 0) + min) * 10) / 10; }
function streak() {
  let n = 0; const d = today();
  if (!S.day[dstr(d)]) d.setDate(d.getDate() - 1);
  while (S.day[dstr(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const SRS_GAP = [1, 3, 7, 14];
const MOT = {
  padrao: { l: 'Não reconheci o padrão', g: 'Você sabia o conteúdo, mas não percebeu o que a questão pedia.', r: c => `Releia os gatilhos e as armadilhas do <a href="#p-${c}">capítulo do padrão</a> e faça mais questões dele no banco.` },
  conteudo: { l: 'Faltou o conteúdo', g: 'O conceito não estava firme.', r: c => `Comece pelo <a href="#t-${c}">resumo teórico</a> e faça os exercícios diretos antes de voltar às questões.` },
  conta: { l: 'Errei a conta', g: 'O raciocínio estava certo, mas a conta parou numa alternativa errada.', r: () => `Refaça com o <a href="#g-p2">protocolo da conta</a> e anote a etapa esquecida: unidade, proporção, rendimento ou pureza.` },
  atencao: { l: 'Li errado ou me distraí', g: 'Você sabia, mas leu errado o comando ou uma palavra.', r: () => 'Releia o comando, marque a palavra que te derrubou e repita a questão na revisão sem pressa.' },
  chute: { l: 'Chutei', g: 'Não sabia por onde começar.', r: c => `Estude o <a href="#t-${c}">resumo teórico</a> antes da revisão. A questão volta para você nos próximos dias.` },
};
function registerMiss(id, src, letter, doubt) {
  const prev = S.srs[id];
  S.srs[id] = { box: 0, due: addDays(1), src, n: (prev ? prev.n : 0) + 1 };
  const e = S.err[id] || { m: null, first: Date.now(), n: 0 };
  Object.assign(e, { t: Date.now(), src, a: letter || null, d: !!doubt, ok: false }); e.n++;
  S.err[id] = e;
}
function srsHit(id) {
  const s = S.srs[id]; if (!s) return;
  s.box++;
  if (s.box >= SRS_GAP.length) { delete S.srs[id]; if (S.err[id]) S.err[id].ok = true; }
  else s.due = addDays(SRS_GAP[s.box]);
}
function dueList() { const t = dstr(); return Object.entries(S.srs).filter(([, s]) => s.due <= t).sort((a, b) => a[1].due.localeCompare(b[1].due)).map(([id]) => id); }
function nextDue() { const f = Object.values(S.srs).map(s => s.due).sort()[0]; return f || null; }
function motivoBox(id) {
  const e = S.err[id]; const m = e && e.m; const c = Q[id].c; const s = S.srs[id];
  return `<div class="mot" data-mot="${id}"><b class="l">Por que você errou?</b>
    <div class="chips2">${Object.entries(MOT).map(([k, v]) => `<button class="chip2 ${m === k ? 'on' : ''}" data-act="motivo" data-q="${id}" data-m="${k}">${v.l}</button>`).join('')}</div>
    ${m ? `<div class="rem">${MOT[m].r(c)}</div>` : ''}
    ${s ? `<div class="small muted">Essa questão volta na sua revisão em ${fmtD(s.due)}.</div>` : ''}</div>`;
}
// tempo por questão no modo prática: começa a contar quando o cartão aparece na tela
const QSTART = {};
const QOBS = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) { const id = e.target.dataset.qc; if (id && !QSTART[id]) QSTART[id] = Date.now(); QOBS.unobserve(e.target); }
}, { threshold: 0.4 }) : null;
function watchCards(root) {
  root.querySelectorAll('.qc[data-qc]').forEach(el => { if (el.querySelector('.opt:not([disabled])')) { if (QOBS) QOBS.observe(el); else QSTART[el.dataset.qc] = QSTART[el.dataset.qc] || Date.now(); } });
}
function takeSeconds(id) { const t0 = QSTART[id]; delete QSTART[id]; return t0 ? Math.min(900, Math.round((Date.now() - t0) / 1000)) : null; }

// ---- revisão do dia
let RV = null;
V.revisao = () => {
  const due = dueList();
  if (!RV || RV.date !== dstr()) RV = { date: dstr(), ids: [], i: 0, res: {} };
  for (const id of due) if (!RV.ids.includes(id)) RV.ids.push(id);
  const done = Object.keys(RV.res).length, total = RV.ids.length;
  const nd = nextDue();
  if (!total) return setView(`<div><div class="eyebrow">Revisão espaçada</div><h1 class="v">Revisão <em>do dia</em></h1></div>
    <div class="panel empty"><p style="margin:0 0 6px"><b>Nada para revisar hoje.</b></p><p class="small" style="margin:0">${nd ? `Próxima revisão em ${fmtD(nd)} (${Object.values(S.srs).filter(s => s.due === nd).length} questões).` : 'Toda questão que você errar ou marcar com dúvida volta aqui em 1, 3, 7 e 14 dias, até você acertar com segurança.'}</p></div>
    <div><a class="btn ghost" href="#erros">Abrir o caderno de erros</a></div>`);
  if (RV.i >= total) return setView(`<div><div class="eyebrow">Revisão espaçada</div><h1 class="v">Revisão concluída: <em>${Object.values(RV.res).filter(x => x.ok).length}/${total}</em></h1></div>
    <div class="panel stack"><p style="margin:0">As que você acertou voltam mais espaçadas. As que errou voltam amanhã.</p>
    ${Object.values(RV.res).some(x => !x.ok) ? '<p class="small muted" style="margin:0">Dica: marque o motivo de cada erro no caderno. É ele que diz o que estudar.</p>' : ''}
    <div class="row"><a class="btn" href="#hoje">Voltar para Hoje</a><a class="btn ghost" href="#erros">Caderno de erros</a></div></div>`);
  const id = RV.ids[RV.i], r = RV.res[id];
  const box = S.srs[id] ? S.srs[id].box : 0;
  const card = r ? qCard(id, { mode: 'review', mine: r.a, dbt: r.d, label: `${RV.i + 1}/${total}` }) : qCard(id, { mode: 'srs', label: `${RV.i + 1}/${total}` });
  setView(`<div><div class="eyebrow">Revisão espaçada · ${done} de ${total} feitas</div><h1 class="v">Revisão <em>do dia</em></h1></div>
    <div class="pbar"><i style="width:${Math.round(done / total * 100)}%"></i></div>
    <p class="small muted" style="margin:0">${r ? '' : `Antes de marcar, explique para você mesmo por que a resposta é aquela. ${box ? `Esta é a ${box + 1}ª revisão desta questão.` : 'Você errou esta questão antes.'}`}</p>
    ${card}
    ${r ? `<div class="row"><button class="btn lime" data-act="rv-next">${RV.i + 1 < total ? 'Próxima questão →' : 'Concluir revisão'}</button></div>` : ''}`, el => watchCards(el));
};
function pickSrs(id, L, card) {
  const q = Q[id], d = !!(card.querySelector(`[data-dbt="${id}"]`) || {}).checked, ok = L === q.g && !d;
  const secs = takeSeconds(id);
  RV.res[id] = { a: L, d, ok };
  if (ok) srsHit(id); else registerMiss(id, 'revisao', L, d);
  S.revDay = S.revDay && S.revDay.date === dstr() ? S.revDay : { date: dstr(), n: 0 }; S.revDay.n++;
  addStudy((secs || 90) / 60);
  logAnswers([{ qid: id, source: 'revisao', letter: L, correct: L === q.g, doubt: d, seconds: secs }]);
  save(); refreshSide(); V.revisao();
}

// ---- caderno de erros
let EF = 'todos';
V.erros = () => {
  const all = Object.entries(S.err);
  const open = all.filter(([, e]) => !e.ok), mastered = all.filter(([, e]) => e.ok);
  const noMot = open.filter(([, e]) => !e.m).length;
  const byMot = {}; for (const [, e] of open) if (e.m) byMot[e.m] = (byMot[e.m] || 0) + 1;
  const byPat = {}; for (const [id] of open) { const c = Q[id].c; byPat[c] = (byPat[c] || 0) + 1; }
  const topPat = Object.entries(byPat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxMot = Math.max(1, ...Object.values(byMot));
  const motRows = Object.entries(MOT).map(([k, v]) => `<div class="mrow"><div class="ml"><b>${v.l}</b><span class="small muted">${v.g}</span></div>
      <div class="pbar" style="flex:1"><i style="width:${Math.round((byMot[k] || 0) / maxMot * 100)}%;background:var(--navy3)"></i></div><b class="tnum">${byMot[k] || 0}</b></div>`).join('');
  const top = Object.entries(byMot).sort((a, b) => b[1] - a[1])[0];
  let list = EF === 'dominadas' ? mastered : EF === 'sem' ? open.filter(([, e]) => !e.m) : EF === 'todos' ? open : open.filter(([, e]) => e.m === EF);
  list = list.sort((a, b) => b[1].t - a[1].t);
  const chip = (k, l, n) => `<button class="chip2 ${EF === k ? 'on' : ''}" data-act="ef" data-f="${k}">${l}${n !== undefined ? ` · ${n}` : ''}</button>`;
  const rows = list.slice(0, 150).map(([id, e]) => { const c = CHI[Q[id].c], s = S.srs[id];
    return `<div class="erow" data-erow="${id}"><button class="ehead" data-act="er-open" data-q="${id}"><span class="dtag ${Q[id].d}">${DSHORT[Q[id].d]}</span>
      <span class="eid">${esc(qLabel(id))}</span><span class="muted small eth">${esc(c.name)}${Q[id].t ? ' · ' + esc(Q[id].t) : ''}</span>
      <span class="emeta">${e.m ? `<span class="badge">${MOT[e.m].l}</span>` : '<span class="badge warn">sem motivo</span>'}${e.ok ? '<span class="badge ok">dominada</span>' : s ? `<span class="small muted">revisão ${fmtD(s.due)}</span>` : ''}</span></button><div class="ebody"></div></div>`; }).join('');
  setView(`<div><div class="eyebrow">Caderno de erros</div><h1 class="v">Seus erros, <em>organizados</em></h1></div>
    <div class="tiles">
      <div class="tile"><div class="k">Erros em aberto</div><div class="v">${open.length}</div><div class="s">${mastered.length} já dominados</div></div>
      <div class="tile"><div class="k">Para revisar hoje</div><div class="v">${dueList().length}</div><div class="s">${dueList().length ? '<a href="#revisao">fazer a revisão</a>' : 'nada pendente'}</div></div>
      <div class="tile"><div class="k">Sem motivo marcado</div><div class="v">${noMot}</div><div class="s">marque para receber o remédio certo</div></div></div>
    <div class="cols2"><section class="panel stack"><h2 class="v">Por que você erra</h2>${motRows}
        ${top ? `<div class="chg"><b>Seu erro mais comum: ${MOT[top[0]].l.toLowerCase()}.</b> ${MOT[top[0]].r(topPat[0] ? topPat[0][0] : 'c01')}</div>` : '<p class="small muted" style="margin:0">Marque o motivo dos seus erros para ver o padrão aqui.</p>'}</section>
      <section class="panel stack"><h2 class="v">Padrões com mais erros</h2>${topPat.length ? topPat.map(([c, n]) => `<div class="row" style="justify-content:space-between"><a href="#p-${c}"><b>${esc(CHI[c].name)}</b></a><span class="tnum">${n} ${n > 1 ? 'erros' : 'erro'}</span></div>`).join('') : '<p class="small muted" style="margin:0">Ainda sem erros registrados.</p>'}</section></div>
    <section class="stack"><div class="chips2">${chip('todos', 'Em aberto', open.length)}${chip('sem', 'Sem motivo', noMot)}${Object.entries(MOT).map(([k, v]) => chip(k, v.l, byMot[k] || 0)).join('')}${chip('dominadas', 'Dominadas', mastered.length)}</div>
      <div class="elist">${rows || '<div class="panel empty">Nenhuma questão aqui. Toda questão errada ou com dúvida entra automaticamente no caderno.</div>'}</div></section>`);
};

// ---- hoje
const TODAY_MIN = [30, 45, 60, 90, 120];
function todayTasks(min) {
  const tasks = []; let left = min;
  if (S.diag.score === undefined) return [{ type: 'diag', m: Math.min(min, 120) }];
  const due = dueList();
  if (due.length) { const n = Math.min(due.length, Math.max(3, Math.floor(min * 0.35 / 2.5))); const m = Math.ceil(n * 2.5); tasks.push({ type: 'rev', n, m }); left -= m; }
  const simPend = S.trilha ? TRILHAS[S.trilha].sims.find(k => !(S.sims[k] && S.sims[k].done)) : null;
  const stepsLeft = activeItems().some(it => !itemDone(it));
  if (simPend && (min >= 120 || !stepsLeft) && left >= SIMDEF[simPend].m * 0.6) { tasks.push({ type: 'sim', k: simPend, m: SIMDEF[simPend].m }); left -= SIMDEF[simPend].m; }
  let full = false;
  for (const it of activeItems()) {
    for (const k of it.steps) {
      if (it.done[k]) continue;
      if (left < 15 || STEP[k].m > left + 10) { full = true; break; }
      tasks.push({ type: 'step', cid: it.cid, k, m: STEP[k].m }); left -= STEP[k].m;
    }
    if (full) break;
  }
  if (left >= 15) {
    const acc = accuracy();
    const cands = (S.fila.length ? S.fila.map(i => i.cid) : CH.map(c => c.id));
    const weak = cands.sort((a, b) => ((acc[a] ? acc[a].ok / acc[a].n : 0.5) - (acc[b] ? acc[b].ok / acc[b].n : 0.5)) || CHI[a].i - CHI[b].i)[0];
    const n = Math.max(3, Math.floor(left / 3));
    tasks.push({ type: 'treino', cid: weak, n, m: n * 3 });
  }
  return tasks;
}
function answeredToday() { const t0 = today().getTime(); return Object.values(S.bank).filter(r => r.t >= t0).length; }
function taskDone(t) {
  if (t.type === 'diag') return S.diag.score !== undefined;
  if (t.type === 'rev') return (S.revDay && S.revDay.date === dstr() ? S.revDay.n : 0) >= t.n || !dueList().length;
  if (t.type === 'sim') return !!(S.sims[t.k] && S.sims[t.k].done);
  if (t.type === 'step') { const it = S.fila.find(x => x.cid === t.cid); return !!(it && it.done[t.k]); }
  if (t.type === 'treino') return answeredToday() - (S.plan.base || 0) >= t.n;
  return false;
}
V.hoje = () => {
  const hw = S.hpw || (S.trilha ? TRILHAS[S.trilha].hpw : 0);
  const def = hw ? TODAY_MIN.reduce((a, b) => Math.abs(b - hw * 60 / 6) < Math.abs(a - hw * 60 / 6) ? b : a) : 60;
  if (!S.plan || S.plan.date !== dstr() || !S.plan.tasks) S.plan = { date: dstr(), min: (S.plan && S.plan.min) || def, base: answeredToday() };
  const stale = S.plan.tasks && S.plan.tasks.some(t => t.type === 'diag') && S.diag.score !== undefined;
  if (!S.plan.tasks || stale) { S.plan.tasks = todayTasks(S.plan.min); save(); }
  const tasks = S.plan.tasks;
  const studied = Math.round(S.day[dstr()] || 0), st = streak(), dleft = Math.max(0, daysBetween(today(), EXAM_DAY));
  const doneN = tasks.filter(taskDone).length;
  const nm = (PROFILE.nome || '').split(' ')[0];
  const row = (t, k) => {
    const dn = taskDone(t); let title = '', sub = '', href = '#', act = '';
    if (t.type === 'diag') { title = 'Fazer o diagnóstico'; sub = '40 questões que montam a sua trilha.'; href = '#diag'; }
    if (t.type === 'rev') { title = `Revisão do dia: ${t.n} ${t.n > 1 ? 'questões' : 'questão'}`; sub = 'Questões que você errou, de volta no momento certo para fixar.'; href = '#revisao'; }
    if (t.type === 'sim') { title = `${SIMDEF[t.k].name}`; sub = SIMDEF[t.k].sub + ', com correção.'; href = '#sim-' + t.k; }
    if (t.type === 'step') { title = `${CHI[t.cid].name}: ${STEP[t.k].l.charAt(0).toLowerCase() + STEP[t.k].l.slice(1)}`; sub = 'Próxima etapa da sua fila.'; href = STEP[t.k].to(t.cid); }
    if (t.type === 'treino') { title = `Treino: ${t.n} questões de ${CHI[t.cid].name}`; sub = 'Seu padrão com menor acerto, só questões novas.'; href = '#banco'; act = `data-act="bank-pat" data-c="${t.cid}"`; }
    const chk = t.type === 'step' ? `<input type="checkbox" data-act="step" data-c="${t.cid}" data-k="${t.k}" ${dn ? 'checked' : ''} aria-label="Marcar como feito">` : `<span class="tchk ${dn ? 'on' : ''}" aria-hidden="true">${dn ? '✓' : ''}</span>`;
    return `<div class="task ${dn ? 'done' : ''}"><span class="tn">${k + 1}</span>${chk}<div class="tt"><b>${esc(title)}</b><span class="small muted">${esc(sub)}</span></div>
      <span class="m">${hm(t.m)}</span><a class="btn sm ${dn ? 'ghost' : ''}" href="${href}" ${act}>${dn ? 'Rever' : 'Começar'}</a></div>`;
  };
  const total = tasks.reduce((a, t) => a + t.m, 0);
  setView(`<div><div class="eyebrow">${esc(fmtLong(today()))}</div><h1 class="v">${nm ? esc(nm) + ', sua' : 'Sua'} sessão de <em>hoje</em></h1></div>
    <div class="tiles">
      <div class="tile"><div class="k">Estudado hoje</div><div class="v">${hm(studied)}</div><div class="s">de ${hm(S.plan.min)} planejados</div></div>
      <div class="tile"><div class="k">Sequência</div><div class="v">${st}</div><div class="s">${st === 1 ? 'dia seguido' : 'dias seguidos'} estudando</div></div>
      <div class="tile"><div class="k">Revisões</div><div class="v">${dueList().length}</div><div class="s">pendentes hoje</div></div>
      <div class="tile"><div class="k">Até a prova</div><div class="v">${dleft}</div><div class="s">dias até 15/11</div></div></div>
    <section class="panel stack"><div class="row"><h2 class="v">Quanto tempo você tem hoje?</h2></div>
      <div class="chips2">${TODAY_MIN.map(m => `<button class="chip2 ${S.plan.min === m ? 'on' : ''}" data-act="today-min" data-m="${m}">${hm(m)}</button>`).join('')}</div>
      <p class="small muted" style="margin:0">A sessão é montada nesta ordem: primeiro as revisões que venceram, depois a próxima etapa da sua fila e, se sobrar tempo, um treino no seu padrão mais fraco.</p></section>
    <section class="stack"><div class="row"><h2 class="v">Plano de hoje · ${hm(total)}</h2><span class="badge ${doneN === tasks.length ? 'ok' : ''}" style="margin-left:auto">${doneN}/${tasks.length} feitas</span></div>
      <div class="tasks">${tasks.map(row).join('')}</div>
      ${doneN === tasks.length && tasks.length ? '<div class="chg" style="border-color:var(--green);background:#E3F8EA"><b>Sessão concluída.</b> Se ainda tiver tempo, faça questões novas no banco ou adiante a próxima etapa da trilha.</div>' : ''}
      <div><button class="btn sm ghost" data-act="today-redo">Montar o plano de novo</button></div></section>`);
};

// ---- painel do mentor
let MT = { tab: 'alunos', q: '', f: 'todos', data: null };
async function mentorLoad(force) {
  if (MT.data && !force) return MT.data;
  const [st, qs, mo] = await Promise.all([SB.rpc('mentor_students'), SB.rpc('mentor_questions'), SB.rpc('mentor_motivos')]);
  if (st.error || qs.error || mo.error) throw (st.error || qs.error || mo.error);
  MT.data = { st: st.data || [], qs: qs.data || [], mo: mo.data || [], at: Date.now() };
  return MT.data;
}
const ago = iso => { if (!iso) return null; return Math.floor((Date.now() - new Date(iso).getTime()) / DAY); };
function stStatus(s) {
  const d = ago(s.ultima);
  if (s.diag_score === null || s.diag_score === undefined) return ['warn', 'Sem diagnóstico', 1];
  if (d === null || d >= 7) return ['bad', d === null ? 'Sem atividade' : `Parado há ${d} dias`, 0];
  if (d >= 3) return ['warn', `Parado há ${d} dias`, 1];
  return ['ok', 'Ativo', 2];
}
V.mentor = async () => {
  if (!window.__ADMIN) return setView('<div class="panel empty">Esta área é só para mentores.</div>');
  setView('<div><div class="eyebrow">Painel do mentor</div><h1 class="v">Sua <em>turma</em></h1></div><div class="panel empty" id="mt">Carregando os dados da turma…</div>');
  let D;
  try { D = await mentorLoad(); } catch (e) { const el = document.getElementById('mt'); if (el) el.textContent = 'Não foi possível carregar os dados. Verifique se sua conta está cadastrada como mentora.'; return; }
  if (location.hash !== '#mentor') return;
  const st = D.st, active = st.filter(s => s.respostas_7d > 0).length, diag = st.filter(s => s.diag_score !== null);
  const avgDiag = diag.length ? (diag.reduce((a, s) => a + s.diag_score, 0) / diag.length).toFixed(1).replace('.', ',') : '—';
  const tabs = [['alunos', 'Alunos'], ['questoes', 'Questões que mais derrubam'], ['padroes', 'Padrões'], ['motivos', 'Motivos de erro']];
  let body = '';
  if (MT.tab === 'alunos') {
    const q = norm(MT.q);
    let rows = st.map(s => ({ s, stt: stStatus(s) })).filter(({ s, stt }) => (!q || norm(`${s.nome} ${s.email} ${s.whatsapp} ${s.cidade || ''}`).includes(q))
      && (MT.f === 'todos' || (MT.f === 'parados' && stt[2] === 0) || (MT.f === 'atencao' && stt[2] === 1) || (MT.f === 'semdiag' && (s.diag_score === null)) || (MT.f === 'contato' && s.aceite_contato)));
    rows.sort((a, b) => a.stt[2] - b.stt[2] || (new Date(b.s.cadastro) - new Date(a.s.cadastro)));
    body = `<div class="filters" style="grid-template-columns:2fr 1fr auto"><label>Buscar<input type="text" id="mt-q" data-act="mt-q" value="${esc(MT.q)}" placeholder="Nome, e-mail, celular ou cidade"></label>
      <label>Mostrar<select id="mt-f" data-act="mt-f">${[['todos', 'Todos'], ['parados', 'Parados (7+ dias)'], ['atencao', 'Precisam de atenção'], ['semdiag', 'Sem diagnóstico'], ['contato', 'Aceitam contato']].map(([v, l]) => `<option value="${v}" ${MT.f === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>&nbsp;<button class="btn sm ghost" data-act="mt-csv">Exportar planilha</button></label></div>
      <div class="tw"><table class="ui"><tr><th>Aluno</th><th>Celular</th><th>Trilha</th><th>Diag.</th><th>Progresso</th><th>Últ. atividade</th><th>7 dias</th><th>Situação</th></tr>
      ${rows.map(({ s, stt }) => { const d = ago(s.ultima); const w = (s.whatsapp || '').replace(/\D/g, '');
        return `<tr><td><button class="lnkbtn" data-act="mt-open" data-id="${s.id}"><b>${esc(s.nome)}</b></button><div class="small muted">${esc(s.email || '')}${s.cidade ? ' · ' + esc(s.cidade) + (s.uf ? '/' + esc(s.uf) : '') : ''}</div></td>
        <td>${w ? `<a href="https://wa.me/55${w}" target="_blank" rel="noopener">${esc(s.whatsapp)}</a>${s.aceite_contato ? '' : '<div class="small muted">sem aceite</div>'}` : '—'}</td>
        <td>${s.trilha ? esc(TRILHAS[s.trilha] ? TRILHAS[s.trilha].name.replace('Trilha ', '') : s.trilha) : '—'}</td><td class="tnum">${s.diag_score ?? '—'}</td>
        <td style="min-width:90px">${s.pct !== null && s.pct !== undefined ? `<div class="row" style="gap:6px;flex-wrap:nowrap"><div class="pbar" style="flex:1"><i style="width:${s.pct}%"></i></div><span class="tnum small">${s.pct}%</span></div>` : '—'}</td>
        <td class="small">${d === null ? '—' : d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`}</td><td class="tnum small">${s.respostas_7d} q · ${s.minutos_7d} min</td><td><span class="badge ${stt[0]}">${stt[1]}</span></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Nenhum aluno neste filtro.</td></tr>'}</table></div>
      <div id="mt-detail"></div>`;
  } else if (MT.tab === 'questoes') {
    const rows = D.qs.filter(x => x.n >= 3 && Q[x.qid]).map(x => ({ ...x, r: x.erros / x.n })).sort((a, b) => b.r - a.r || b.n - a.n).slice(0, 25);
    body = `<p class="small muted" style="margin:0">Questões com pelo menos 3 respostas, ordenadas pela taxa de erro (dúvida conta como erro).</p>
      <div class="tw"><table class="ui"><tr><th>Questão</th><th>Padrão</th><th>Respostas</th><th>Erro</th><th>Tempo médio</th><th></th></tr>
      ${rows.map(x => `<tr><td><b>${esc(qLabel(x.qid))}</b>${Q[x.qid].t ? `<div class="small muted">${esc(Q[x.qid].t)}</div>` : ''}</td><td>${esc(CHI[Q[x.qid].c].name)}</td><td class="tnum">${x.n}</td>
        <td class="tnum" style="font-weight:800;color:${x.r >= .6 ? 'var(--red-ink)' : 'inherit'}">${Math.round(x.r * 100)}%</td><td class="tnum">${x.seg_medio ? clock(x.seg_medio).replace(/^0:/, '') : '—'}</td>
        <td><button class="btn sm ghost" data-act="mt-q-open" data-q="${x.qid}">Ver</button></td></tr><tr class="mt-qrow" data-qrow="${x.qid}" hidden><td colspan="6"></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Ainda não há respostas suficientes.</td></tr>'}</table></div>`;
  } else if (MT.tab === 'padroes') {
    const agg = {}; for (const x of D.qs) { if (!Q[x.qid]) continue; const c = Q[x.qid].c; const a = agg[c] = agg[c] || { n: 0, e: 0, s: 0, sn: 0 }; a.n += x.n; a.e += x.erros; if (x.seg_medio) { a.s += x.seg_medio * x.n; a.sn += x.n; } }
    const rows = CH.map(c => ({ c, a: agg[c.id] })).filter(x => x.a).sort((x, y) => (y.a.e / y.a.n) - (x.a.e / x.a.n));
    body = `<p class="small muted" style="margin:0">Acerto da turma por padrão, somando diagnóstico, banco, treinos e simulados. Use para escolher o tema das próximas aulas ao vivo.</p>
      <div class="tw"><table class="ui"><tr><th>Padrão</th><th>Onda</th><th>Respostas</th><th>Acerto da turma</th><th>Tempo médio</th></tr>
      ${rows.map(({ c, a }) => { const p = Math.round((1 - a.e / a.n) * 100); return `<tr><td><b>${esc(c.name)}</b></td><td>O${c.onda}</td><td class="tnum">${a.n}</td>
        <td style="min-width:160px"><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="pbar" style="flex:1"><i style="width:${p}%;background:${p >= 70 ? 'var(--green)' : p >= 50 ? 'var(--amber)' : 'var(--red)'}"></i></div><b class="tnum">${p}%</b></div></td>
        <td class="tnum">${a.sn ? clock(a.s / a.sn).replace(/^0:/, '') : '—'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Ainda sem respostas.</td></tr>'}</table></div>`;
  } else {
    const tot = D.mo.reduce((a, x) => a + Number(x.n), 0) || 1;
    body = `<p class="small muted" style="margin:0">O que os alunos marcam quando erram. Muito “faltou o conteúdo” pede aula de teoria; muito “não reconheci o padrão” pede resolução comentada de questões.</p>
      ${Object.entries(MOT).map(([k, v]) => { const n = Number((D.mo.find(x => x.motivo === k) || {}).n || 0); return `<div class="mrow"><div class="ml"><b>${v.l}</b></div><div class="pbar" style="flex:1"><i style="width:${Math.round(n / tot * 100)}%;background:var(--navy3)"></i></div><b class="tnum">${n}</b></div>`; }).join('')}`;
  }
  setView(`<div class="row"><div><div class="eyebrow">Painel do mentor</div><h1 class="v">Sua <em>turma</em></h1></div><button class="btn sm ghost" data-act="mt-reload" style="margin-left:auto">Atualizar dados</button></div>
    <div class="tiles"><div class="tile"><div class="k">Alunos</div><div class="v">${st.length}</div><div class="s">cadastrados</div></div>
      <div class="tile"><div class="k">Ativos</div><div class="v">${active}</div><div class="s">responderam questões nos últimos 7 dias</div></div>
      <div class="tile"><div class="k">Diagnóstico</div><div class="v">${diag.length}</div><div class="s">feitos · média ${avgDiag}/40</div></div>
      <div class="tile"><div class="k">Parados</div><div class="v">${st.filter(s => stStatus(s)[2] === 0).length}</div><div class="s">há 7 dias ou mais</div></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#" class="${MT.tab === k ? 'on' : ''}" data-act="mt-tab" data-t="${k}">${l}</a>`).join('')}</div>
    <section class="panel stack">${body}</section>`, el => { const i = el.querySelector('#mt-q'); if (i && MT.q) { i.focus(); i.setSelectionRange(MT.q.length, MT.q.length); } });
};
async function mentorDetail(id) {
  const box = document.getElementById('mt-detail'); if (!box) return;
  const s = MT.data.st.find(x => x.id === id);
  box.innerHTML = '<div class="panel empty">Carregando o aluno…</div>'; box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const { data, error } = await SB.from('progress').select('state').eq('user_id', id).maybeSingle();
  const g = (data && data.state) || {};
  if (error) { box.innerHTML = '<div class="panel empty">Não foi possível abrir este aluno.</div>'; return; }
  const sem = g.sem || {}, fila = g.fila || [], sims = g.sims || {}, err = g.err || {}, srs = g.srs || {};
  const doneItems = fila.filter(it => it.steps && it.steps.every(k => it.done && it.done[k])).length;
  const days = g.day || {}; const last7 = Array.from({ length: 7 }, (_, i) => { const d = today(); d.setDate(d.getDate() - 6 + i); return [d, days[dstr(d)] || 0]; });
  const mx = Math.max(30, ...last7.map(x => x[1]));
  const errOpen = Object.values(err).filter(e => !e.ok); const mot = {}; errOpen.forEach(e => { if (e.m) mot[e.m] = (mot[e.m] || 0) + 1; });
  box.innerHTML = `<div class="panel stack" style="border-color:var(--navy3)"><div class="row"><h2 class="v">${esc(s ? s.nome : 'Aluno')}</h2><button class="btn sm ghost" data-act="mt-close" style="margin-left:auto">Fechar</button></div>
    <div class="small muted">${esc(s ? [s.email, s.escolaridade, s.curso, s.origem ? 'origem: ' + s.origem : ''].filter(Boolean).join(' · ') : '')}</div>
    <div class="tiles"><div class="tile"><div class="k">Diagnóstico</div><div class="v">${g.diag && g.diag.score !== undefined ? g.diag.score + '/40' : '—'}</div><div class="s">${g.trilha && TRILHAS[g.trilha] ? TRILHAS[g.trilha].name : 'sem trilha'}</div></div>
      <div class="tile"><div class="k">Fila</div><div class="v">${doneItems}/${fila.length}</div><div class="s">padrões concluídos</div></div>
      <div class="tile"><div class="k">Erros em aberto</div><div class="v">${errOpen.length}</div><div class="s">${Object.keys(srs).length} na revisão espaçada</div></div>
      <div class="tile"><div class="k">Simulados</div><div class="v">${Object.values(sims).filter(r => r.done).length}</div><div class="s">${Object.entries(sims).filter(([, r]) => r.done).map(([k, r]) => `${k}: ${r.score}`).join(' · ') || 'nenhum feito'}</div></div></div>
    <div class="cols2"><div class="stack"><h3 class="v">Semáforo</h3><div class="sema">${CH.map(c => `<a href="#p-${c.id}"><span class="dot ${sem[c.id] || ''}"></span>${esc(c.name)}</a>`).join('')}</div></div>
      <div class="stack"><h3 class="v">Minutos estudados (7 dias)</h3><div class="bars7">${last7.map(([d, v]) => `<div><i style="height:${Math.round(v / mx * 100)}%"></i><span>${d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}</span><b class="tnum">${Math.round(v)}</b></div>`).join('')}</div>
        <h3 class="v">Motivos de erro</h3><div class="small">${Object.entries(mot).map(([k, n]) => `${MOT[k].l}: <b>${n}</b>`).join(' · ') || '<span class="muted">nenhum marcado</span>'}</div></div></div></div>`;
}
function mentorCSV() {
  const cols = ['nome', 'email', 'whatsapp', 'cidade', 'uf', 'escolaridade', 'curso', 'aceite_contato', 'origem', 'cadastro', 'trilha', 'diag_score', 'pct', 'ultima', 'respostas_7d', 'minutos_7d'];
  const q = v => { v = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = '﻿' + cols.join(';') + '\n' + MT.data.st.map(s => cols.map(c => q(s[c])).join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `alunos-natureza40-${dstr()}.csv`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ---------------------------------------------------------------- router
function go(h) { location.hash = '#' + h; }
function route() {
  const h = (location.hash || '#hoje').slice(1) || 'hoje';
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', h === a.dataset.r || h.startsWith(a.dataset.r + '-') || (a.dataset.r === 'padroes' && /^p-/.test(h)) || (a.dataset.r === 'teoria' && /^t-/.test(h)) || (a.dataset.r === 'guia' && /^g-/.test(h)) || (a.dataset.r === 'diag' && h === 'diag-rev')));
  document.querySelector('.sidebar').classList.remove('open'); const sc = document.querySelector('.scrim'); if (sc) sc.remove();
  let m;
  window.scrollTo(0, 0);
  if ((m = h.match(/^p-(c\d\d)(?:-(treino))?$/))) return V.p(m[1], m[2]);
  if ((m = h.match(/^t-(c\d\d)(?:-(ex))?$/))) return V.t(m[1], m[2]);
  if ((m = h.match(/^g-(\w+)$/))) return V.g(m[1]);
  if ((m = h.match(/^sim-(A1|A2|A|B|C)$/))) return V.sim(m[1]);
  if (h === 'sim') return V.sim();
  if (V[h]) return V[h]();
  return V.hoje();
}
function refreshSide() {
  const who = document.getElementById('who'); if (who) who.innerHTML = `<span>${esc((PROFILE.nome || USER.email || '').split(' ')[0])}</span><button data-act="logout">Sair</button>`;
  const nb = document.getElementById('nb-rev'); if (nb) { const n = dueList().length; nb.textContent = n || ''; nb.hidden = !n; }
  const mn = document.querySelector('.nav [data-r=mentor]'); if (mn) mn.hidden = !window.__ADMIN;
  const el = document.getElementById('sidecount'); if (!el) return;
  const dleft = Math.max(0, daysBetween(today(), EXAM_DAY));
  if (S.trilha) { const p = plan(); el.innerHTML = `<b>${p.pct}%</b>da ${TRILHAS[S.trilha].name}<br>${p.rem ? `término previsto ${fmt(p.end)}` : 'concluída'} · ${dleft} dias até 15/11`; }
  else el.innerHTML = `<b>${dleft}</b>dias até o 2º dia do ENEM (15/11)`;
}

// ---------------------------------------------------------------- events
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (a && !a.dataset.act) {
    const h = a.getAttribute('href').slice(1);
    let m;
    if ((m = h.match(/^sec-(c\d\d)$/))) { e.preventDefault(); return go('p-' + m[1]); }
    if ((m = h.match(/^teo-(c\d\d)$/))) { e.preventDefault(); return go('t-' + m[1]); }
    if (/^sec-|^teo-/.test(h)) { e.preventDefault(); const map = { 'sec-p1': 'g-p1', 'sec-p2': 'g-p2', 'sec-p4': 'g-p4', 'sec-ficha': 'g-ficha', 'sec-comecar': 'g-comecar', 'sec-diag': 'diag', 'sec-crono': 'trilha', 'sec-mapa-sim': 'sim', 'sec-gabarito': 'banco' }; return go(map[h] || 'guia'); }
    return;
  }
  const t = e.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act;
  const H = {
    menu() { const sb = document.querySelector('.sidebar'); sb.classList.add('open'); const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => { sb.classList.remove('open'); s.remove(); }; document.body.append(s); },
    'q-pick'() { pickPractice(t.dataset.q, t.dataset.l, t.closest('.qc')); },
    'srs-pick'() { pickSrs(t.dataset.q, t.dataset.l, t.closest('.qc')); },
    'rv-next'() { RV.i++; V.revisao(); window.scrollTo(0, 0); },
    motivo() { const id = t.dataset.q, m = t.dataset.m; const e = S.err[id] || (S.err[id] = { first: Date.now(), t: Date.now(), n: 1, ok: false });
      const changed = e.m !== m; e.m = m; save();
      if (changed) SB.from('error_log').insert({ user_id: USER.id, qid: id, source: e.src || null, motivo: m }).then(({ error }) => { if (error) console.warn('error_log', error.message); });
      const box = t.closest('.mot'); if (box) { const tmp = document.createElement('div'); tmp.innerHTML = motivoBox(id); box.replaceWith(tmp.firstElementChild); }
      const er = document.querySelector(`[data-erow="${id}"] .emeta`); if (er && location.hash === '#erros') { /* lista atualiza ao reabrir */ } },
    ef() { EF = t.dataset.f; V.erros(); },
    'er-open'() { const row = t.closest('.erow'), body = row.querySelector('.ebody'), id = t.dataset.q;
      if (body.innerHTML) { body.innerHTML = ''; return; }
      const e = S.err[id] || {}; body.innerHTML = qCard(id, { mode: 'review', mine: e.a, dbt: e.d }); hydrate(body); },
    'today-min'() { S.plan = { date: dstr(), min: +t.dataset.m, base: answeredToday() }; S.plan.tasks = todayTasks(S.plan.min); save(); V.hoje(); },
    'today-redo'() { S.plan = { date: dstr(), min: S.plan.min || 60, base: answeredToday() }; S.plan.tasks = todayTasks(S.plan.min); save(); V.hoje(); },
    'mt-tab'() { e.preventDefault(); MT.tab = t.dataset.t; V.mentor(); },
    async 'mt-reload'() { await mentorLoad(true).catch(() => {}); V.mentor(); },
    'mt-csv'() { if (MT.data) mentorCSV(); },
    'mt-open'() { mentorDetail(t.dataset.id); },
    'mt-close'() { const b = document.getElementById('mt-detail'); if (b) b.innerHTML = ''; },
    'mt-q-open'() { const row = document.querySelector(`[data-qrow="${t.dataset.q}"]`); if (!row) return; row.hidden = !row.hidden;
      if (!row.hidden && !row.firstElementChild.innerHTML) { const id = t.dataset.q; row.firstElementChild.innerHTML = `<div class="qimgbox"><img data-q="${id}" alt="Questão"></div><p class="small" style="margin:8px 0 0">Gabarito: <b>${Q[id].g}</b> · Padrão ${esc(CHI[Q[id].c].name)} · ${COB[Q[id].m] || ''}</p>`; hydrate(row); } },
    'diag-start'() { S.diag.step = 'run'; save(); diagRun(); },
    'run-go'() { const i = +t.dataset.i; const ctx = curRun(); if (!ctx || i < 0 || i >= ctx.n) return; ctx.st.cur = i; save(); rerun(); },
    'run-pick'() { const ctx = curRun(); ctx.st.ans[ctx.st.cur] = t.dataset.l; save(); rerun(); },
    'run-dbt'() { const ctx = curRun(); ctx.st.dbt[ctx.st.cur] = t.checked; save(); const b = document.querySelector(`.qgrid button[data-i="${ctx.st.cur}"]`); if (b) b.classList.toggle('d', t.checked); },
    'run-end'() { const ctx = curRun(); const miss = Array.from({ length: ctx.n }, (_, i) => i).filter(i => !ctx.st.ans[i]).length;
      document.getElementById('endbox').innerHTML = `<div class="confirm"><b>${miss ? `Faltam ${miss} questões sem resposta. Elas contam como erro.` : 'Todas respondidas.'}</b><div class="row"><button class="btn lime sm" data-act="run-confirm">Entregar e corrigir</button><button class="btn ghost sm" data-act="run-cancel">Voltar à prova</button></div></div>`; },
    'run-cancel'() { document.getElementById('endbox').innerHTML = ''; },
    'run-confirm'() { stopTick(); const ctx = curRun(); if (ctx.kind === 'diag') { S.diag.step = 'sabia'; save(true); diagSabia(); } else { finishSim(ctx.k); simResult(ctx.k); refreshSide(); } window.scrollTo(0, 0); },
    sabia() { S.diag.sabia[t.dataset.c] = t.dataset.v === '1'; save(); const y = window.scrollY; diagSabia(); window.scrollTo(0, y); },
    'diag-peek'() { e.preventDefault(); const box = document.querySelector(`[data-peek="${t.dataset.c}"]`); if (box.innerHTML) { box.innerHTML = ''; return; }
      const { per } = diagScore(); box.innerHTML = `<div class="stack" style="margin-bottom:10px">${per[t.dataset.c].idx.map(i => qCard(META.diag[i], { mode: 'review', mine: S.diag.ans[i], dbt: S.diag.dbt[i], label: 'D' + String(i + 1).padStart(2, '0') })).join('')}</div>`; hydrate(box); },
    'diag-build'() { const tq = S.diag.tq || {}; logAnswers(META.diag.map((id, i) => ({ qid: id, source: 'diag', letter: S.diag.ans[i] || null, correct: S.diag.ans[i] === Q[id].g, doubt: !!S.diag.dbt[i], seconds: tq[i] ? Math.min(7200, Math.round(tq[i])) : null })));
      META.diag.forEach((id, i) => { if (S.diag.ans[i] !== Q[id].g || S.diag.dbt[i]) registerMiss(id, 'diag', S.diag.ans[i], S.diag.dbt[i]); }); buildTrail(); S.diag.step = 'result'; save(true); refreshSide(); diagResult(); window.scrollTo(0, 0); },
    step() { const changed = markStep(t.dataset.c, t.dataset.k, t.checked); if (changed) { refreshSide(); const h = location.hash; if (h === '#trilha' || h === '#inicio' || h === '#hoje' || h === '') { const y = window.scrollY; route(); window.scrollTo(0, y); } } },
    cutp3() { S.cutP3 = t.checked; save(); const y = window.scrollY; V.trilha(); window.scrollTo(0, y); refreshSide(); },
    fw() { S.rev[t.dataset.k] = t.checked; save(); },
    async logout() { await pushRemote(); await SB.auth.signOut(); location.hash = ''; location.reload(); },
    'reset-ask'() { document.getElementById('bkbox').innerHTML = `<div class="confirm"><b>Refazer o diagnóstico apaga a trilha atual, a fila e o semáforo. Questões do banco e simulados continuam salvos.</b><div class="row"><button class="btn sm danger" data-act="reset-do">Apagar a trilha e refazer</button><button class="btn sm ghost" data-act="run-cancel2">Cancelar</button></div></div>`; },
    'run-cancel2'() { document.getElementById('bkbox').innerHTML = ''; },
    'reset-do'() { const keep = { bank: S.bank, sims: S.sims, teo: S.teo }; S = Object.assign(blank(), keep); save(true); refreshSide(); go('diag'); },
    'bk-open'() { BF.i = +t.dataset.i; V.banco(); },
    'bk-nav'() { BF.i = Math.max(0, BF.i + +t.dataset.d); V.banco(); },
    'bank-pat'() { e.preventDefault(); BF = { d: '', c: t.dataset.c, y: '', a: '', m: '', s: 'novas', i: 0 }; go('banco'); },
    'sim-start'() { S.sims[t.dataset.k].started = true; save(); V.sim(t.dataset.k); },
    scroll() { const el = document.getElementById(t.dataset.t); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'ai-explain'() { explainQuestion(t.closest('.ai'), t.closest('.ai').dataset.q, t.closest('.ai').dataset.mine); },
    'ai-coach'() { coach(t.closest('.ai')); },
    'ai-sim'() { simCoach(t.closest('.ai'), t.closest('.ai').dataset.k); },
    'ai-stop'() { const b = t.closest('.ai'); if (b._ctl) b._ctl.abort(); },
    'tutor-send'() { const sec = t.closest('[data-tutor]'); const inp = sec.querySelector('input'); const v = inp.value; inp.value = ''; tutorSend(sec, v); },
    'tutor-quick'() { tutorSend(t.closest('[data-tutor]'), t.dataset.s); },
    'tutor-stop'() { const sec = t.closest('[data-tutor]'); if (sec._ctl) sec._ctl.abort(); },
  };
  if (H[act]) H[act]();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act === 'bf') { BF[t.dataset.f] = t.value; BF.i = 0; V.banco(); }
  if (t.dataset.act === 'mt-f') { MT.f = t.value; V.mentor(); }
  if (t.dataset.act === 'hpw') { S.hpw = +t.value; save(); const y = window.scrollY; V.trilha(); window.scrollTo(0, y); refreshSide(); }
});
let MTQ = null;
document.addEventListener('input', e => {
  if (e.target.dataset.act === 'mt-q') { MT.q = e.target.value; clearTimeout(MTQ); MTQ = setTimeout(() => V.mentor(), 350); } if (e.target.dataset.act === 'hpw') { const v = document.getElementById('hpwv'); if (v) v.textContent = e.target.value + ' h'; } });
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'tut-in') { e.preventDefault(); const sec = e.target.closest('[data-tutor]'); const v = e.target.value; e.target.value = ''; tutorSend(sec, v); }
  const ctx = curRun(); if (!ctx || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (/^[a-eA-E]$/.test(e.key)) { ctx.st.ans[ctx.st.cur] = e.key.toUpperCase(); save(); rerun(); }
  if (e.key === 'ArrowRight' && ctx.st.cur < ctx.n - 1) { ctx.st.cur++; save(); rerun(); }
  if (e.key === 'ArrowLeft' && ctx.st.cur > 0) { ctx.st.cur--; save(); rerun(); }
});
function curRun() {
  const h = location.hash.slice(1);
  if (h === 'diag' && S.diag.step === 'run') return { kind: 'diag', st: S.diag, n: 40 };
  const m = h.match(/^sim-(A1|A2|A|B|C)$/);
  if (m && S.sims[m[1]] && S.sims[m[1]].started && !S.sims[m[1]].done) return { kind: 'sim', k: m[1], st: S.sims[m[1]], n: simIds(m[1]).length };
  return null;
}
function rerun() {
  const ctx = curRun(); if (!ctx) return;
  const keepT = ctx.st;
  if (ctx.kind === 'diag') diagRun(); else V.sim(ctx.k);
  startTick(keepT);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopTick(); save(true); } else if (curRun()) startTick(curRun().st); });
window.addEventListener('hashchange', route);
refreshSide();
route();
})();
