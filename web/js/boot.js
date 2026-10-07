/* Natureza 40+ — entrada: login, cadastro, perfil e carregamento do app. */
(function () {
'use strict';
const CFG = window.__CFG;
const SB = window.SB = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const auth = $('#auth');

// origem do cadastro (?utm_source=instagram ou ?origem=...)
try {
  const p = new URLSearchParams(location.search);
  const o = p.get('origem') || p.get('utm_source');
  if (o) sessionStorage.setItem('n40.origem', o.slice(0, 60));
} catch (e) { /* ignore */ }

const ERR = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
  [/already registered|already been registered|user already exists/i, 'Este e-mail já tem conta. Entre com sua senha.'],
  [/password should be at least|weak password|password is too short/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/rate limit|too many|security purposes/i, 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'],
  [/invalid email|unable to validate email/i, 'Confira o e-mail digitado.'],
  [/failed to fetch|network/i, 'Sem conexão com a internet. Tente de novo.'],
];
const msgOf = e => { const m = (e && (e.message || e.error_description)) || ''; for (const [re, t] of ERR) if (re.test(m)) return t; return 'Não foi possível concluir agora. Tente de novo em instantes.'; };

function shell(inner) {
  auth.hidden = false;
  auth.innerHTML = `<div class="authwrap">
    <section class="authbrand"><img src="img/logo.png" alt="Mentoria Mário Machado" class="alogo">
      <div class="big40">40+</div><h1 class="v">em Ciências da Natureza</h1>
      <p class="lede">Diagnóstico de 40 questões reais, trilha de estudo com data de término, os 20 padrões do ENEM, 720 questões de 2018 a 2025 e um tutor de IA.</p>
      <ul class="authlist"><li>Sua trilha montada automaticamente</li><li>Progresso salvo em qualquer aparelho</li><li>Explicações com IA no método do material</li></ul></section>
    <section class="authcard">${inner}</section></div>`;
}
function showAuth(mode, note) {
  const signup = mode === 'signup';
  shell(`<div class="tabs" role="tablist"><a href="#" class="${signup ? '' : 'on'}" data-mode="login">Entrar</a><a href="#" class="${signup ? 'on' : ''}" data-mode="signup">Criar conta</a></div>
    <h2 class="v">${signup ? 'Crie sua conta gratuita' : 'Entre na plataforma'}</h2>
    ${note ? `<div class="fb ok">${note}</div>` : ''}
    <form id="af" class="stack" novalidate>
      <label class="fl" for="em">E-mail<input id="em" type="email" autocomplete="email" required></label>
      <label class="fl" for="pw">Senha<input id="pw" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></label>
      ${signup ? '<p class="small muted" style="margin:0">Use pelo menos 6 caracteres.</p>' : ''}
      <div id="aerr" class="fb no" hidden></div>
      <button class="btn lime" type="submit" id="asub">${signup ? 'Criar conta' : 'Entrar'}</button>
      ${signup ? '' : '<a href="#" id="forgot" class="small">Esqueci minha senha</a>'}
    </form>`);
  auth.querySelectorAll('[data-mode]').forEach(a => a.onclick = e => { e.preventDefault(); showAuth(a.dataset.mode); });
  const f = $('#af'), err = $('#aerr'), btn = $('#asub');
  const fail = t => { err.textContent = t; err.hidden = false; btn.disabled = false; btn.textContent = signup ? 'Criar conta' : 'Entrar'; };
  f.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const email = $('#em').value.trim(), password = $('#pw').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Confira o e-mail digitado.');
    if (password.length < 6) return fail('A senha precisa ter pelo menos 6 caracteres.');
    btn.disabled = true; btn.textContent = signup ? 'Criando…' : 'Entrando…';
    if (signup) {
      const { data, error } = await SB.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) return fail(msgOf(error));
      if (data.user && data.user.identities && data.user.identities.length === 0) return fail('Este e-mail já tem conta. Entre com sua senha.');
      if (data.session) return afterLogin(data.session.user);
      return showConfirm(email);
    }
    const { data, error } = await SB.auth.signInWithPassword({ email, password });
    if (error) return fail(msgOf(error));
    afterLogin(data.user);
  };
  const fg = $('#forgot');
  if (fg) fg.onclick = async e => {
    e.preventDefault();
    const email = $('#em').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Digite seu e-mail no campo acima e clique de novo em “Esqueci minha senha”.');
    const { error } = await SB.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) return fail(msgOf(error));
    showAuth('login', `Enviamos um link para ${esc(email)}. Abra-o para criar uma nova senha.`);
  };
}
function showConfirm(email) {
  shell(`<h2 class="v">Confirme seu e-mail</h2>
    <p>Enviamos um link de confirmação para <b>${esc(email)}</b>. Abra o e-mail e clique no link: você volta para cá já com a conta ativa.</p>
    <p class="small muted">Não chegou? Veja a caixa de spam ou promoções.</p>
    <button class="btn ghost" id="back">Voltar para o login</button>`);
  $('#back').onclick = () => showAuth('login');
}
function showNewPassword() {
  shell(`<h2 class="v">Crie uma nova senha</h2>
    <form id="np" class="stack" novalidate><label class="fl" for="np1">Nova senha<input id="np1" type="password" autocomplete="new-password" minlength="6" required></label>
    <div id="nperr" class="fb no" hidden></div><button class="btn lime" type="submit">Salvar senha</button></form>`);
  $('#np').onsubmit = async e => {
    e.preventDefault();
    const pw = $('#np1').value, er = $('#nperr');
    if (pw.length < 6) { er.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; er.hidden = false; return; }
    const { data, error } = await SB.auth.updateUser({ password: pw });
    if (error) { er.textContent = msgOf(error); er.hidden = false; return; }
    history.replaceState(null, '', location.pathname);
    afterLogin(data.user);
  };
}

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
function showProfile(user) {
  shell(`<h2 class="v">Só mais um passo</h2><p class="small muted" style="margin:0">Esses dados ajudam a mentoria a acompanhar sua preparação.</p>
    <form id="pf" class="stack" novalidate>
      <label class="fl" for="pnome">Nome completo<input id="pnome" autocomplete="name" required maxlength="120"></label>
      <label class="fl" for="pwpp">WhatsApp com DDD<input id="pwpp" type="tel" inputmode="tel" autocomplete="tel" placeholder="(62) 99999-9999" required></label>
      <div class="frow"><label class="fl" for="pcid" style="flex:2">Cidade<input id="pcid" autocomplete="address-level2" maxlength="80"></label>
        <label class="fl" for="puf" style="flex:1">UF<select id="puf"><option value="">—</option>${UFS.map(u => `<option ${u === 'GO' ? '' : ''}>${u}</option>`).join('')}</select></label></div>
      <label class="fl" for="pesc">Escolaridade<select id="pesc" required><option value="">Selecione</option><option>1º ano do ensino médio</option><option>2º ano do ensino médio</option><option>3º ano do ensino médio</option><option>Já concluí o ensino médio</option><option>Outra situação</option></select></label>
      <label class="fl" for="pcur">Curso que pretende fazer<input id="pcur" maxlength="80" placeholder="Ex.: Medicina"></label>
      <fieldset class="fl"><legend>Você já fez o ENEM?</legend><div class="row"><label class="chk"><input type="radio" name="fez" value="1"> Sim</label><label class="chk"><input type="radio" name="fez" value="0"> Não</label></div></fieldset>
      <label class="chk"><input type="checkbox" id="pterm"> <span>Li e aceito os <a href="termos.html" target="_blank" rel="noopener">termos de uso e a política de privacidade</a>.</span></label>
      <label class="chk"><input type="checkbox" id="pcont"> <span>Aceito receber contato da Mentoria Mário Machado pelo WhatsApp (opcional).</span></label>
      <div id="perr" class="fb no" hidden></div>
      <button class="btn lime" type="submit" id="psub">Começar</button>
      <a href="#" id="pout" class="small">Sair desta conta</a>
    </form>`);
  $('#pout').onclick = async e => { e.preventDefault(); await SB.auth.signOut(); showAuth('login'); };
  $('#pwpp').addEventListener('input', e => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const er = $('#perr'), fail = t => { er.textContent = t; er.hidden = false; btn.disabled = false; btn.textContent = 'Começar'; }, btn = $('#psub');
    const nome = $('#pnome').value.trim(), wpp = $('#pwpp').value.replace(/\D/g, '');
    if (nome.length < 2) return fail('Digite seu nome.');
    if (wpp.length < 10 || wpp.length > 11) return fail('Digite o WhatsApp com DDD, só números.');
    if (!$('#pesc').value) return fail('Escolha sua escolaridade.');
    if (!$('#pterm').checked) return fail('Para usar a plataforma, aceite os termos de uso e a política de privacidade.');
    const fez = (document.querySelector('input[name=fez]:checked') || {}).value;
    btn.disabled = true; btn.textContent = 'Salvando…';
    let origem = null; try { origem = sessionStorage.getItem('n40.origem'); } catch (x) { origem = null; }
    const row = { id: user.id, nome, whatsapp: wpp, cidade: $('#pcid').value.trim() || null, uf: $('#puf').value || null, escolaridade: $('#pesc').value,
      curso: $('#pcur').value.trim() || null, fez_enem: fez === undefined ? null : fez === '1', aceite_termos: true, aceite_contato: $('#pcont').checked, origem };
    const { error } = await SB.from('profiles').insert(row);
    if (error) return fail(msgOf(error));
    startApp(user, row);
  };
}

async function afterLogin(user) {
  shell('<div class="empty">Carregando…</div>');
  const { data: prof, error } = await SB.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) { shell(`<h2 class="v">Não foi possível carregar sua conta</h2><p>${esc(msgOf(error))}</p><button class="btn" onclick="location.reload()">Tentar de novo</button>`); return; }
  if (!prof) return showProfile(user);
  startApp(user, prof);
}
async function startApp(user, profile) {
  shell('<div class="empty">Preparando sua trilha…</div>');
  try {
    const [meta, prog] = await Promise.all([
      fetch('data/meta.json').then(r => { if (!r.ok) throw new Error('meta'); return r.json(); }),
      SB.from('progress').select('state').eq('user_id', user.id).maybeSingle(),
    ]);
    window.__META = meta; window.__USER = user; window.__PROFILE = profile;
    window.__STATE = prog && prog.data ? prog.data.state : null;
  } catch (e) {
    shell(`<h2 class="v">Sem conexão</h2><p>Não foi possível carregar a plataforma. Verifique a internet e tente de novo.</p><button class="btn" onclick="location.reload()">Tentar de novo</button>`); return;
  }
  auth.hidden = true; auth.innerHTML = '';
  $('#appshell').hidden = false;
  const s = document.createElement('script'); s.src = 'js/app.js?v=' + CFG.v; document.body.append(s);
}

let recovering = false;
SB.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') { recovering = true; showNewPassword(); } });
(async () => {
  const { data } = await SB.auth.getSession();
  if (recovering) return;
  if (/type=recovery/.test(location.hash) && data.session) { recovering = true; return showNewPassword(); }
  if (!data.session) return showAuth('login');
  if (/access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  afterLogin(data.session.user);
})();
})();
