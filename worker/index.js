// Proxy de emissão de NFC-e (Focus NFe) em Cloudflare Workers. O token da Focus fica em segredo aqui.
//
// Deploy (uma vez, grátis):
//   cd worker
//   npx wrangler login
//   npx wrangler secret put FOCUS_NFE_TOKEN_HOMOLOGACAO   (token do modo de teste da Focus NFe)
//   npx wrangler secret put FOCUS_NFE_TOKEN_PRODUCAO      (token do modo real; só quando for valer)
//   (se a Focus der um token único, use só: npx wrangler secret put FOCUS_NFE_TOKEN)
//   npx wrangler secret put SUPABASE_SERVICE_ROLE          (produtos/agenda/compras/pets/usuários, ver supabase/*.sql)
//   npx wrangler deploy
// A URL final (https://laviola-fiscal.<sua-conta>.workers.dev) vai em Configurações > Nota Fiscal.

const FOCUS_HOSTS = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao: 'https://api.focusnfe.com.br',
};
const ACCOUNTANT = ['contador', 'accountant'];
const STAFF = ['desenvolvedor', 'proprietaria', 'gerente', 'colaborador', 'developer', 'owner', 'manager', 'collaborator'];
// Mesma hierarquia do navegador (src/supabaseClient.ts: roleHierarchy/canManage), só que aplicada aqui também,
// porque a chave de serviço do Supabase ignora o RLS: a regra de "quem manda em quem" tem que ser conferida à mão.
const ROLE_RANK = { developer: 4, owner: 3, manager: 2, collaborator: 1, accountant: 0.5, client: 0 };
const normalizeRole = (r) => ({ desenvolvedor: 'developer', proprietaria: 'owner', gerente: 'manager', colaborador: 'collaborator', cliente: 'client', contador: 'accountant' }[r] || r);
const rank = (r) => ROLE_RANK[normalizeRole(r)] ?? -1;
const canManage = (actorRole, targetRole) => rank(actorRole) > rank(targetRole);
// Serviços de push aceitos (o endereço vem do navegador do entregador; só enviamos para estes).
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w-]+\.notify\.windows\.com|[\w-]+\.push\.apple\.com|web\.push\.apple\.com)$/;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

// Valida o ID token do Firebase (RS256) sem bibliotecas: assinatura, emissor, público e validade.
async function verifyFirebaseToken(token, projectId) {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) throw new Error('token malformado');
  const header = b64urlToJson(h);
  const payload = b64urlToJson(p);

  const jwks = await (await fetch(JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } })).json();
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') throw new Error('chave desconhecida');

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` ||
      payload.exp < now || !payload.sub) {
    throw new Error('token inválido');
  }
  return payload;
}

// ---- Cadastro de usuários (Supabase, via chave de serviço) ---------------------------------------------------
// profiles/{uid} deixou de ter leitura pública (vazava nome/telefone/e-mail/cargo de todo mundo) e também deixou
// de viver no Firestore (o limite diário de leituras do plano gratuito bloqueava o sistema inteiro, já que o
// cargo é conferido em praticamente toda chamada). Agora é uma tabela comum do Supabase, só lida/escrita por aqui.
async function getRole(uid, env) {
  const r = await sb(env, `/profiles?id=eq.${encodeURIComponent(uid)}&select=role`);
  if (!r.ok) throw new Error('cargo indisponível'); // erro do Supabase: não confundir com "sem cargo"
  return r.body[0]?.role || null;
}

// Uma ou mais linhas de 'profiles' que batem um campo (username é case-insensitive; phone/email, exato).
async function sbFindProfiles(env, field, value) {
  const op = field === 'username' ? 'ilike' : 'eq';
  const r = await sb(env, `/profiles?select=id,email,username,phone&${field}=${op}.${encodeURIComponent(value)}&limit=5`);
  if (!r.ok) throw new Error('consulta ao cadastro indisponível');
  return r.body;
}

// ---- Supabase (produtos e agenda) -------------------------------------------------------------------------------
// O navegador nunca fala com o Supabase: tudo passa por aqui. O Worker confere quem é o usuário e o cargo, e só então
// usa a chave de serviço (segredo SUPABASE_SERVICE_ROLE), que ignora o RLS das tabelas.
const roleCache = new Map();

// Limite simples por IP nas rotas públicas de login/cadastro (dificulta varredura de usuários/celulares).
// É por isolamento do Worker, não um limite global rígido entre todos os pontos do Cloudflare; mesmo assim barra
// um script simples batendo repetido no mesmo lugar.
const authCallLog = new Map();
async function allowPublicAuthCall(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  const now = Date.now();
  const windowMs = 60000;
  const hits = (authCallLog.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= 20) return false;
  hits.push(now);
  authCallLog.set(ip, hits);
  if (authCallLog.size > 5000) authCallLog.clear(); // evita crescer sem limite num Worker de vida longa
  return true;
}

async function sb(env, path, init = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE,
      // Chave nova (sb_secret_...) vai só no apikey; a antiga (service_role, um JWT) também no Authorization.
      ...(env.SUPABASE_SERVICE_ROLE.startsWith('eyJ') ? { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}` } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}

// O Supabase devolve no máximo 1000 linhas por pedido: lê página por página.
// Arquivo num bucket do Supabase Storage (qualquer bucket, não só "compras").
async function sbStorage(env, bucket, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE,
      ...(env.SUPABASE_SERVICE_ROLE.startsWith('eyJ') ? { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}` } : {}),
      ...(init.headers || {}),
    },
  });
}

async function sbAll(env, path) {
  const rows = [];
  for (let from = 0; from < 50000; from += 1000) {
    const r = await sb(env, path, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    if (!r.ok) throw new Error(`supabase ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    rows.push(...r.body);
    if (r.body.length < 1000) break;
  }
  return rows;
}

const PRODUCT_TEXT = ['name', 'category', 'brand', 'sku', 'unit', 'ncm', 'origin'];
const PRODUCT_NUM = ['price', 'cost_price', 'quantity', 'min_stock'];

// Só aceita os campos conhecidos, com o tipo certo.
function pickProduct(input) {
  const out = {};
  for (const k of PRODUCT_TEXT) if (input[k] !== undefined) out[k] = String(input[k]).slice(0, 300);
  for (const k of PRODUCT_NUM) {
    if (input[k] === undefined) continue;
    const n = Number(input[k]);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new Error(`valor inválido em ${k}`);
    out[k] = n;
  }
  return out;
}

const toProduct = (row) => ({ ...row, updated_ms: Date.parse(row.updated_at) || 0 });

const toAppt = (row) => ({
  id: row.id,
  series_id: row.series_id || null,
  pet_id: row.pet_id,
  pet_name: row.pet_name,
  tutor_name: row.tutor_name,
  owner_id: row.owner_id,
  service_type: row.service_type,
  status: row.status,
  start: row.starts_at,
  duration_min: row.duration_min,
  notes: row.notes,
  payment_flag: row.payment_flag || null,
  clubinho_cycle_position: row.clubinho_cycle_position ?? null,
  cancel_reason: row.cancel_reason || null,
  created_at: row.created_at,
});

const APPT_STATUS = ['Agendado', 'Em Andamento', 'Concluído', 'Cancelado'];
const PAYMENT_FLAGS = ['a_confirmar', 'debito', 'pago'];
const PAYMENT_METHODS = ['pix', 'debito', 'credito', 'especie'];
const CANCEL_REASONS = ['aviso_previo', 'sem_aviso'];
const CLUBINHO_CYCLE_VISITS = { semanal: 4, quinzenal: 2 };

// Mesma lógica de comparação de nomes do navegador (src/utils/clubinhoService.ts normalizeNameForMatch/
// tutorNamesMatch) — duplicada aqui porque o Worker não importa código do app. Qualquer ajuste numa precisa
// ser espelhado na outra.
function normalizeNameForMatch(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function levenshteinDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
function tutorNamesMatch(a, b) {
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const maxDist = Math.min(na.length, nb.length) >= 7 ? 2 : 1;
  return levenshteinDistance(na, nb) <= maxDist;
}

/** Acha a assinatura do Clubinho de um agendamento (por pet_id, senão por nome+tutor) — mesma regra do navegador. */
async function findClubinhoSubForAppt(env, apptRow) {
  if (apptRow.pet_id) {
    const r = await sb(env, `/clubinho_subscriptions?pet_id=eq.${encodeURIComponent(apptRow.pet_id)}&is_active=eq.true&select=*&limit=1`);
    if (r.ok && r.body[0]) return r.body[0];
  }
  const nameKey = normalizeNameForMatch(apptRow.pet_name);
  if (!nameKey) return null;
  const all = await sb(env, '/clubinho_subscriptions?is_active=eq.true&select=*');
  if (!all.ok) return null;
  const candidates = all.body.filter((s) => normalizeNameForMatch(s.pet_name) === nameKey);
  if (candidates.length === 0) return null;
  const apptTutor = (apptRow.tutor_name || '').trim();
  if (!apptTutor) return candidates.length === 1 ? candidates[0] : null;
  return candidates.find((c) => tutorNamesMatch(apptTutor, c.tutor_name)) || null;
}

/** Posição (1..N) desta data dentro do ciclo da assinatura — mesma fórmula de src/utils/clubinhoService.ts. */
function clubinhoCyclePosition(sub, dateISO) {
  const total = CLUBINHO_CYCLE_VISITS[sub.plan_type];
  if (!total) return null;
  const intervalDays = sub.plan_type === 'quinzenal' ? 14 : 7;
  const cycleLen = intervalDays * total;
  const started = new Date(sub.started_at + 'T00:00:00');
  const d = new Date(dateISO);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((dayStart.getTime() - started.getTime()) / 86400000);
  let mod = diffDays % cycleLen;
  if (mod < 0) mod += cycleLen;
  return Math.floor(mod / intervalDays) + 1;
}

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Web Push sem conteúdo (não exige criptografia do texto): o serviço do celular só "acorda" o aparelho,
// e o service worker mostra o aviso fixo de nova entrega. Autenticado por VAPID (JWT ES256).
async function sendWebPush(endpoint, env) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || !PUSH_HOSTS.test(url.hostname)) throw new Error('endereço de push não permitido');
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: url.origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${header}.${claims}.${b64url(signature)}, k=${env.VAPID_PUBLIC_KEY}`,
      TTL: '3600',
      Urgency: 'high',
      'Content-Length': '0',
    },
  });
}

function absolutize(body, host) {
  for (const k of ['caminho_danfe', 'caminho_xml_nota_fiscal', 'caminho_xml_cancelamento', 'url_danfe']) {
    if (body && typeof body[k] === 'string' && body[k].startsWith('/')) body[k] = host + body[k];
  }
  return body;
}

export default {
  // Cron do Cloudflare (a cada 2 horas): faz uma consulta de verdade nas duas tabelas, para o Supabase nunca "dormir".
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return;
      for (const path of ['/products?select=id&limit=1', '/appointments?select=id&limit=1']) {
        const r = await sb(env, path, { headers: { Prefer: 'count=none' } });
        console.log(`keep-alive supabase ${path.split('?')[0]}: ${r.status}`);
      }
    })());
  },

  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      Vary: 'Origin',
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed.includes(origin)) return json({ mensagem: 'Origem não autorizada.' }, 403);

    try {
      // ---- Login e cadastro: a pessoa ainda não está logada, então estas rotas não pedem token. -------------------
      // Antes, o navegador buscava isso direto no Firestore, o que exigia deixar o cadastro de TODO MUNDO com leitura
      // pública (nome, telefone, e-mail, cargo). Agora só o Worker lê o Firestore, e só devolve o mínimo necessário:
      // "existe?" e "qual é o e-mail?" — nunca a lista nem os dados de outras pessoas.
      const authUrl = new URL(request.url);
      const authRoute = authUrl.pathname.replace(/\/+$/, '');
      // /auth/me e /auth/register exigem login (tratadas mais abaixo, depois de validar o token); as outras
      // rotas de /auth/ são as de pré-login e não pedem token.
      if (authRoute.startsWith('/auth/') && authRoute !== '/auth/me' && authRoute !== '/auth/register') {
        if (!(await allowPublicAuthCall(request))) return json({ mensagem: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }, 429);

        if (request.method === 'GET' && authRoute === '/auth/resolve-login') {
          const id = (authUrl.searchParams.get('id') || '').trim().slice(0, 120);
          if (!id) return json({ email: null });
          if (id.toLowerCase() === 'admin') return json({ email: 'admin@laviola.com' });
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) return json({ email: id }); // já é um e-mail: usa direto, sem consultar o banco
          try {
            for (const [field, value] of [['username', id], ['phone', id]]) {
              const found = await sbFindProfiles(env, field, value);
              if (found[0]) return json({ email: found[0].email || null });
            }
            return json({ email: null });
          } catch (e) {
            return json({ mensagem: 'Não foi possível conferir o login agora. Tente de novo em instantes.' }, 503);
          }
        }

        if (request.method === 'GET' && authRoute === '/auth/check') {
          const field = authUrl.searchParams.get('field');
          const value = (authUrl.searchParams.get('value') || '').trim().slice(0, 120);
          const excludeId = authUrl.searchParams.get('excludeId') || '';
          if (!['email', 'phone', 'username'].includes(field) || !value) return json({ mensagem: 'Requisição inválida.' }, 400);
          try {
            const found = await sbFindProfiles(env, field, value);
            return json({ exists: found.some((p) => p.id !== excludeId) });
          } catch (e) {
            return json({ mensagem: 'Não foi possível conferir agora. Tente de novo em instantes.' }, 503);
          }
        }

        if (request.method === 'GET' && authRoute === '/auth/suggest-username') {
          const base = (authUrl.searchParams.get('base') || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
          if (!base) return json({ suggestions: [] });
          const candidates = [`${base}1`, `${base}123`, `${base}_pet`, `${base}_oficial`, `${base}br`, `${base}2026`, `${base}_${Math.floor(Math.random() * 999)}`];
          const suggestions = [];
          try {
            for (const c of candidates) {
              if (suggestions.length >= 3) break;
              const found = await sbFindProfiles(env, 'username', c);
              if (found.length === 0) suggestions.push(c);
            }
          } catch (e) { /* devolve o que já tiver achado */ }
          return json({ suggestions });
        }

        return json({ mensagem: 'Rota não encontrada.' }, 404);
      }

      const bearer = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
      if (!bearer) return json({ mensagem: 'Acesso negado.' }, 401);
      const user = await verifyFirebaseToken(bearer[1], env.FIREBASE_PROJECT_ID);
      let cached = roleCache.get(user.sub);
      if (!cached || cached.exp < Date.now()) {
        try {
          cached = { role: await getRole(user.sub, env), exp: Date.now() + 5 * 60000 };
          roleCache.set(user.sub, cached);
        } catch (e) {
          // Sem conseguir confirmar o cargo agora: usa o último conhecido (se houver) em vez de negar o acesso.
          if (!cached) return json({ mensagem: 'Não foi possível confirmar o seu cargo agora (o cadastro de usuários está indisponível). Tente de novo em alguns minutos.' }, 503);
        }
      }
      const role = cached.role;
      const isStaff = STAFF.includes(role);

      // ---- Minha Conta (perfil do próprio usuário logado) ----
      const meUrl = new URL(request.url);
      const meRoute = meUrl.pathname.replace(/\/+$/, '');
      if (meRoute === '/auth/me') {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ mensagem: 'Banco de dados não configurado.' }, 503);

        if (request.method === 'GET') {
          let r = await sb(env, `/profiles?id=eq.${encodeURIComponent(user.sub)}&select=*`);
          if (!r.ok) return json({ mensagem: 'Erro ao carregar o seu cadastro.' }, 502);
          let row = r.body[0];
          // Autocura: perfil achado por e-mail mas com outro id (ex.: troca de UID numa migração antiga).
          if (!row && user.email) {
            const byEmail = await sb(env, `/profiles?email=eq.${encodeURIComponent(user.email)}&select=*`);
            if (byEmail.ok && byEmail.body[0]) {
              const old = byEmail.body[0];
              const moved = await sb(env, `/profiles?id=eq.${encodeURIComponent(old.id)}`, { method: 'PATCH', body: JSON.stringify({ id: user.sub }) });
              if (moved.ok && moved.body[0]) row = moved.body[0];
            }
          }
          return json({ profile: row || null });
        }

        if (request.method === 'PATCH') {
          const input = await request.json();
          const fields = {};
          if (input.full_name !== undefined) fields.full_name = String(input.full_name).slice(0, 200);
          if (input.username !== undefined) fields.username = String(input.username).slice(0, 60);
          if (input.phone !== undefined) fields.phone = String(input.phone).slice(0, 30);
          // Só permite desligar o aviso de troca obrigatória de senha, nunca ligar (isso é feito só na criação/redefinição).
          if (input.must_change_password === false) fields.must_change_password = false;
          if (Object.keys(fields).length === 0) return json({ mensagem: 'Nada para alterar.' }, 400);
          const r = await sb(env, `/profiles?id=eq.${encodeURIComponent(user.sub)}`, { method: 'PATCH', body: JSON.stringify(fields) });
          if (!r.ok) return json({ mensagem: 'Erro ao salvar o seu cadastro.' }, 502);
          return r.body.length ? json({ profile: r.body[0] }) : json({ mensagem: 'Cadastro não encontrado.' }, 404);
        }

        return json({ mensagem: 'Método não permitido.' }, 405);
      }

      // Cadastro próprio (recém-criado no Firebase Auth, ainda sem linha em 'profiles'): só cria o perfil de
      // cliente dele mesmo. Qualquer outro cargo, ou criar perfil de outra pessoa, passa por /usuarios (equipe).
      if (request.method === 'POST' && meRoute === '/auth/register') {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ mensagem: 'Banco de dados não configurado.' }, 503);
        if (role) return json({ mensagem: 'Você já tem um cadastro.' }, 409); // já existe linha em profiles: não é registro novo
        const input = await request.json();
        const fullName = String(input.full_name || '').trim().slice(0, 200);
        if (!fullName) return json({ mensagem: 'Informe o nome completo.' }, 400);
        const fields = {
          id: user.sub,
          email: user.email || '',
          full_name: fullName,
          username: String(input.username || '').trim().slice(0, 60),
          phone: String(input.phone || '').trim().slice(0, 30),
          role: 'client',
          is_active: true,
          must_change_password: false,
        };
        const r = await sb(env, '/profiles', { method: 'POST', body: JSON.stringify(fields) });
        if (!r.ok) return json({ mensagem: 'Erro ao concluir o cadastro.', detalhe: typeof r.body === 'object' ? r.body?.message : undefined }, 502);
        roleCache.delete(user.sub);
        return json({ profile: r.body[0] }, 201);
      }

      // ---- Usuários (equipe gerenciando cadastros: listar, criar, editar, excluir) ----
      // A conta de login em si (Firebase Auth) continua sendo criada pelo navegador, com a sessão secundária
      // (para não deslogar quem está criando). Aqui só entra a linha de 'profiles' — e a conferência de cargo:
      // só quem tem posto estritamente mais alto que o cargo (atual ou pedido) do outro pode agir sobre ele.
      const uUrl = new URL(request.url);
      const uRoute = uUrl.pathname.replace(/\/+$/, '');
      if (uRoute === '/usuarios' || uRoute.startsWith('/usuarios/')) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ mensagem: 'Banco de dados não configurado.' }, 503);
        if (!isStaff) return json({ mensagem: 'Acesso negado.' }, 403);
        const failU = (mensagem, r) => json({ mensagem, detalhe: typeof r?.body === 'object' ? r.body?.message : undefined }, 502);

        if (request.method === 'GET' && uRoute === '/usuarios') {
          const r = await sb(env, '/profiles?select=*&order=full_name.asc');
          return r.ok ? json({ usuarios: r.body }) : failU('Erro ao listar os usuários.', r);
        }

        if (request.method === 'POST' && uRoute === '/usuarios') {
          const input = await request.json();
          const targetRole = normalizeRole(String(input.role || 'client'));
          if (!(role === 'developer' || canManage(role, targetRole))) return json({ mensagem: 'Você não pode criar um usuário com esse cargo.' }, 403);
          const uid = String(input.id || '').trim();
          if (!uid) return json({ mensagem: 'Requisição inválida (id do login).' }, 400);
          const fullName = String(input.full_name || '').trim().slice(0, 200);
          if (!fullName) return json({ mensagem: 'Informe o nome completo.' }, 400);
          const fields = {
            id: uid,
            email: String(input.email || '').trim().slice(0, 200),
            full_name: fullName,
            username: String(input.username || '').trim().slice(0, 60),
            phone: String(input.phone || '').trim().slice(0, 30),
            role: targetRole,
            collaborator_specialty: targetRole === 'collaborator' ? String(input.collaborator_specialty || '').slice(0, 100) : '',
            is_active: true,
            // A senha foi escolhida por quem está criando a conta, não pelo dono: ele é obrigado a trocá-la no primeiro login.
            must_change_password: true,
          };
          const r = await sb(env, '/profiles', { method: 'POST', body: JSON.stringify(fields) });
          return r.ok ? json({ usuario: r.body[0] }, 201) : failU('Erro ao criar o usuário.', r);
        }

        const one = /^\/usuarios\/([\w-]+)$/.exec(uRoute);
        if (one && (request.method === 'PATCH' || request.method === 'DELETE')) {
          const targetId = one[1];
          const cur = await sb(env, `/profiles?id=eq.${encodeURIComponent(targetId)}&select=role`);
          if (!cur.ok) return failU('Erro ao buscar o usuário.', cur);
          if (!cur.body[0]) return json({ mensagem: 'Usuário não encontrado.' }, 404);
          const currentRole = cur.body[0].role;
          const isSelf = targetId === user.sub;
          const canAct = canManage(role, currentRole) || (isSelf && role === 'developer');
          if (!canAct) return json({ mensagem: 'Acesso negado.' }, 403);

          if (request.method === 'DELETE') {
            if (isSelf) return json({ mensagem: 'Você não pode excluir seu próprio usuário.' }, 400);
            const r = await sb(env, `/profiles?id=eq.${encodeURIComponent(targetId)}`, { method: 'DELETE' });
            if (!r.ok) return failU('Erro ao excluir o usuário.', r);
            roleCache.delete(targetId);
            return json({ ok: true });
          }

          const input = await request.json();
          const fields = {};
          if (input.full_name !== undefined) fields.full_name = String(input.full_name).trim().slice(0, 200);
          if (input.username !== undefined) fields.username = String(input.username).trim().slice(0, 60);
          if (input.phone !== undefined) fields.phone = String(input.phone).trim().slice(0, 30);
          if (input.is_active !== undefined) {
            if (isSelf) return json({ mensagem: 'Você não pode desativar seu próprio usuário.' }, 400);
            fields.is_active = !!input.is_active;
          }
          if (input.role !== undefined) {
            const targetRole = normalizeRole(String(input.role));
            if (!(role === 'developer' || canManage(role, targetRole) || targetRole === currentRole)) {
              return json({ mensagem: 'Você não pode atribuir esse cargo.' }, 403);
            }
            fields.role = targetRole;
            fields.collaborator_specialty = targetRole === 'collaborator' ? String(input.collaborator_specialty || '').slice(0, 100) : '';
          }
          if (Object.keys(fields).length === 0) return json({ mensagem: 'Nada para alterar.' }, 400);
          const r = await sb(env, `/profiles?id=eq.${encodeURIComponent(targetId)}`, { method: 'PATCH', body: JSON.stringify(fields) });
          if (!r.ok) return failU('Erro ao salvar o usuário.', r);
          roleCache.delete(targetId);
          return r.body.length ? json({ usuario: r.body[0] }) : json({ mensagem: 'Usuário não encontrado.' }, 404);
        }

        return json({ mensagem: 'Rota não encontrada.' }, 404);
      }

      // ---- Pets (cadastro, foto e documentos) ----
      // Leitura: equipe vê todos; cliente só os seus. Escrita: equipe cuida de qualquer pet; o tutor cuida dos
      // próprios (cadastra, edita, anexa documentos) — mas só a equipe liga um pet "sem dono" a um cliente,
      // pra ninguém conseguir reivindicar o pet de outra pessoa só adivinhando o nome.
      const petsUrl = new URL(request.url);
      const petsRoute = petsUrl.pathname.replace(/\/+$/, '');
      if (petsRoute === '/pets' || petsRoute.startsWith('/pets/') || petsRoute.startsWith('/meuspets')) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ mensagem: 'Banco de dados não configurado.' }, 503);
        const failPet = (mensagem, r) => json({ mensagem, detalhe: typeof r?.body === 'object' ? r.body?.message : undefined }, 502);

        const PET_TEXT = ['name', 'species', 'breed', 'tutor_hint'];
        const pickPet = (input, { allowOwner }) => {
          const out = {};
          for (const k of PET_TEXT) if (input[k] !== undefined) out[k] = String(input[k]).slice(0, 200);
          if (input.age !== undefined) {
            const n = Math.floor(Number(input.age));
            if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('idade inválida');
            out.age = n;
          }
          if (input.owner_id !== undefined) {
            if (!allowOwner) throw new Error('só a equipe pode definir o dono do pet');
            out.owner_id = String(input.owner_id).slice(0, 80);
          }
          return out;
        };

        // Lista: a equipe vê todos; o cliente só os seus.
        if (request.method === 'GET' && (petsRoute === '/pets' || petsRoute === '/meuspets')) {
          const path = isStaff ? '/pets?select=*&order=name.asc' : `/pets?select=*&owner_id=eq.${encodeURIComponent(user.sub)}&order=name.asc`;
          const r = await sb(env, path);
          return r.ok ? json({ pets: r.body }) : failPet('Erro ao listar os pets.', r);
        }

        // Cadastra: cliente cadastra o próprio pet (owner_id = ele mesmo); equipe pode indicar outro dono.
        if (request.method === 'POST' && petsRoute === '/pets') {
          const input = await request.json();
          if (!String(input.name || '').trim()) return json({ mensagem: 'Informe o nome do pet.' }, 400);
          let fields;
          try { fields = pickPet(input, { allowOwner: isStaff }); } catch (e) { return json({ mensagem: e.message }, 400); }
          if (!isStaff) fields.owner_id = user.sub;
          fields.created_by = user.sub;
          const r = await sb(env, '/pets', { method: 'POST', body: JSON.stringify(fields) });
          return r.ok ? json({ pet: r.body[0] }, 201) : failPet('Erro ao cadastrar o pet.', r);
        }

        const one = /^\/pets\/([\w-]+)$/.exec(petsRoute);
        if (one) {
          const petId = one[1];
          if (request.method === 'PATCH') {
            const cur = await sb(env, `/pets?id=eq.${encodeURIComponent(petId)}&select=owner_id`);
            if (!cur.ok || !cur.body[0]) return json({ mensagem: 'Pet não encontrado.' }, 404);
            if (!isStaff && cur.body[0].owner_id !== user.sub) return json({ mensagem: 'Acesso negado.' }, 403);
            const input = await request.json();
            let fields;
            try { fields = pickPet(input, { allowOwner: isStaff }); } catch (e) { return json({ mensagem: e.message }, 403); }
            if (Object.keys(fields).length === 0) return json({ mensagem: 'Nada para alterar.' }, 400);
            const r = await sb(env, `/pets?id=eq.${encodeURIComponent(petId)}`, { method: 'PATCH', body: JSON.stringify(fields) });
            return r.ok ? json({ pet: r.body[0] }) : failPet('Erro ao salvar o pet.', r);
          }
          if (request.method === 'DELETE') {
            const cur = await sb(env, `/pets?id=eq.${encodeURIComponent(petId)}&select=owner_id`);
            if (!cur.ok || !cur.body[0]) return json({ mensagem: 'Pet não encontrado.' }, 404);
            if (!isStaff && cur.body[0].owner_id !== user.sub) return json({ mensagem: 'Acesso negado.' }, 403);
            const r = await sb(env, `/pets?id=eq.${encodeURIComponent(petId)}`, { method: 'DELETE' });
            if (!r.ok) return failPet('Erro ao remover o pet.', r);
            await sbStorage(env, 'pets', `${petId}/photo`, { method: 'DELETE' }).catch(() => {});
            return json({ ok: true });
          }
        }

        // Foto e documentos (sempre dentro de /pets/:id/...)
        const fm = /^\/pets\/([\w-]+)\/(photo|docs)(?:\/([\w.-]+))?$/.exec(petsRoute);
        if (fm) {
          const [, petId, kind, docId] = fm;
          if (kind === 'docs' && request.method !== 'GET' && !docId) return json({ mensagem: 'Requisição inválida.' }, 400);

          const cur = await sb(env, `/pets?id=eq.${encodeURIComponent(petId)}&select=owner_id,documents`);
          if (!cur.ok) return failPet('Não foi possível conferir o dono do pet agora.', cur);
          if (!cur.body[0]) return json({ mensagem: 'Pet não encontrado.' }, 404);
          const petRow = cur.body[0];
          if (!isStaff && petRow.owner_id !== user.sub) return json({ mensagem: 'Acesso negado.' }, 403);

          const storagePath = kind === 'photo' ? `${petId}/photo` : `${petId}/docs/${docId}`;

          if (request.method === 'GET') {
            const f = await sbStorage(env, 'pets', storagePath);
            if (!f.ok) return json({ mensagem: kind === 'photo' ? 'Este pet ainda não tem foto.' : 'Documento não encontrado.' }, 404);
            return new Response(f.body, { headers: { ...cors, 'Content-Type': f.headers.get('Content-Type') || 'application/octet-stream' } });
          }

          if (request.method === 'PUT') {
            const ct = request.headers.get('Content-Type') || '';
            const label = (request.headers.get('X-Doc-Label') || '').slice(0, 80);
            const bytes = await request.arrayBuffer();
            const limit = kind === 'photo' ? 8 * 1024 * 1024 : 15 * 1024 * 1024;
            if (bytes.byteLength === 0 || bytes.byteLength > limit) return json({ mensagem: `Envie um arquivo de até ${limit / 1024 / 1024} MB.` }, 400);
            const head = new Uint8Array(bytes.slice(0, 4));
            const isJpeg = head[0] === 0xff && head[1] === 0xd8;
            const isPng = head[0] === 0x89 && head[1] === 0x50;
            const isPdf = new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
            if (kind === 'photo' && !(isJpeg || isPng)) return json({ mensagem: 'Envie uma foto em JPG ou PNG.' }, 400);
            if (kind === 'docs' && !(isJpeg || isPng || isPdf)) return json({ mensagem: 'Envie uma foto (JPG/PNG) ou um PDF.' }, 400);
            const contentType = ct || (isPdf ? 'application/pdf' : isPng ? 'image/png' : 'image/jpeg');
            const up = await sbStorage(env, 'pets', storagePath, { method: 'POST', headers: { 'Content-Type': contentType, 'x-upsert': 'true' }, body: bytes });
            if (!up.ok) return json({ mensagem: 'Erro ao guardar o arquivo.' }, 502);
            if (kind === 'docs') {
              const docs = Array.isArray(petRow.documents) ? petRow.documents.filter((d) => d.id !== docId) : [];
              docs.push({ id: docId, label: label || 'Documento', content_type: contentType, uploaded_at: new Date().toISOString() });
              const up2 = await sb(env, `/pets?id=eq.${encodeURIComponent(petId)}`, { method: 'PATCH', body: JSON.stringify({ documents: docs }) });
              if (!up2.ok) return failPet('Arquivo guardado, mas não consegui atualizar a lista de documentos.', up2);
              return json({ ok: true, documents: docs }, 201);
            }
            return json({ ok: true }, 201);
          }

          if (request.method === 'DELETE') {
            const del = await sbStorage(env, 'pets', storagePath, { method: 'DELETE' });
            if (!del.ok && del.status !== 404) return json({ mensagem: 'Erro ao remover o arquivo.' }, 502);
            if (kind === 'docs') {
              const docs = (Array.isArray(petRow.documents) ? petRow.documents : []).filter((d) => d.id !== docId);
              const up2 = await sb(env, `/pets?id=eq.${encodeURIComponent(petId)}`, { method: 'PATCH', body: JSON.stringify({ documents: docs }) });
              if (!up2.ok) return failPet('Arquivo removido, mas não consegui atualizar a lista de documentos.', up2);
              return json({ ok: true, documents: docs });
            }
            return json({ ok: true });
          }

          return json({ mensagem: 'Método não permitido.' }, 405);
        }

        return json({ mensagem: 'Rota não encontrada.' }, 404);
      }

      // ---- Produtos e agenda (Supabase) ----
      const dbUrl = new URL(request.url);
      const dbRoute = dbUrl.pathname.replace(/\/+$/, '');
      if (dbRoute.startsWith('/agenda/') || dbRoute.startsWith('/produtos') || dbRoute.startsWith('/compras')) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ mensagem: 'Banco de dados não configurado.' }, 503);
        const fail = (mensagem, r) => json({ mensagem, detalhe: typeof r?.body === 'object' ? r.body?.message : undefined }, 502);

        // ----- Produtos: só a equipe -----
        if (dbRoute.startsWith('/produtos')) {
          if (!isStaff) return json({ mensagem: 'Acesso negado.' }, 403);

          // Sincronização: tudo (since=0) ou só o que mudou desde o último instante visto
          if (request.method === 'GET' && dbRoute === '/produtos') {
            const since = Number(dbUrl.searchParams.get('since') || 0);
            let path = '/products?select=*&order=updated_at.asc';
            path += since > 0 ? `&updated_at=gt.${encodeURIComponent(new Date(since).toISOString())}` : '&deleted=eq.false';
            return json({ products: (await sbAll(env, path)).map(toProduct) });
          }

          if (request.method === 'POST' && dbRoute === '/produtos') {
            const input = pickProduct(await request.json());
            if (!input.name) return json({ mensagem: 'Informe o nome do produto.' }, 400);
            const r = await sb(env, '/products', { method: 'POST', body: JSON.stringify(input) });
            return r.ok ? json({ product: toProduct(r.body[0]) }, 201) : fail('Erro ao cadastrar o produto.', r);
          }

          // Preenche NCM/origem de vários produtos (importação por planilha)
          if (request.method === 'POST' && dbRoute === '/produtos/lote') {
            const { items } = await request.json();
            if (!Array.isArray(items) || items.length > 2000) return json({ mensagem: 'Requisição inválida.' }, 400);
            const clean = items.map((i) => ({ id: String(i.id), ncm: i.ncm === undefined ? null : String(i.ncm).replace(/\D/g, '').slice(0, 8), origin: i.origin === undefined ? null : String(i.origin).slice(0, 1) }));
            const r = await sb(env, '/rpc/set_ncm_batch', { method: 'POST', body: JSON.stringify({ items: clean }) });
            return r.ok ? json({ updated: r.body }) : fail('Erro ao salvar o lote.', r);
          }

          // Baixa/devolve estoque, tudo ou nada. mode: sale (não deixa ficar negativo), void/undo (devolve ou desfaz).
          if (request.method === 'POST' && dbRoute === '/produtos/estoque') {
            const { items, mode } = await request.json();
            const valid = Array.isArray(items) && items.length > 0 && items.length <= 300 &&
              items.every((i) => typeof i.id === 'string' && Number.isFinite(Number(i.delta)));
            if (!valid || !['sale', 'void', 'undo'].includes(mode)) return json({ mensagem: 'Requisição inválida.' }, 400);
            const r = await sb(env, '/rpc/adjust_stock', {
              method: 'POST',
              body: JSON.stringify({ items: items.map((i) => ({ id: i.id, delta: Number(i.delta) })), enforce: false, ignore_missing: mode !== 'sale' }),
            });
            if (!r.ok) return fail('Erro ao ajustar o estoque.', r);
            return json(r.body, r.body.ok ? 200 : 409);
          }

          const prod = /^\/produtos\/([\w-]+)$/.exec(dbRoute);
          if (prod && request.method === 'PATCH') {
            const patch = pickProduct(await request.json());
            if (Object.keys(patch).length === 0) return json({ mensagem: 'Nada para alterar.' }, 400);
            const r = await sb(env, `/products?id=eq.${encodeURIComponent(prod[1])}`, { method: 'PATCH', body: JSON.stringify(patch) });
            if (!r.ok) return fail('Erro ao salvar o produto.', r);
            return r.body.length ? json({ product: toProduct(r.body[0]) }) : json({ mensagem: 'Produto não encontrado.' }, 404);
          }
          if (prod && request.method === 'DELETE') {
            // Não apaga de verdade: marca como removido, para os outros aparelhos perceberem na sincronização.
            const r = await sb(env, `/products?id=eq.${encodeURIComponent(prod[1])}`, { method: 'PATCH', body: JSON.stringify({ deleted: true }) });
            return r.ok ? json({ ok: true }) : fail('Erro ao remover o produto.', r);
          }
          return json({ mensagem: 'Rota não encontrada.' }, 404);
        }

        // ----- Notas fiscais de compra (entrada de mercadoria): só a equipe -----
        if (dbRoute.startsWith('/compras')) {
          if (!isStaff) return json({ mensagem: 'Acesso negado.' }, 403);
          const storage = (path, init = {}) => fetch(`${env.SUPABASE_URL}/storage/v1/object/compras/${path}`, {
            ...init,
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE,
              ...(env.SUPABASE_SERVICE_ROLE.startsWith('eyJ') ? { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}` } : {}),
              ...(init.headers || {}),
            },
          });

          // Lista das notas já lançadas (sem o XML, que é pesado)
          if (request.method === 'GET' && dbRoute === '/compras') {
            const r = await sb(env, '/purchases?select=id,access_key,number,series,issued_at,supplier_name,supplier_cnpj,total,has_pdf,created_at,created_by,items&order=created_at.desc&limit=500');
            return r.ok ? json({ purchases: r.body }) : fail('Erro ao listar as notas de compra.', r);
          }

          // Vínculos "código do fornecedor → produto" de um fornecedor
          if (request.method === 'GET' && dbRoute === '/compras/vinculos') {
            const cnpj = (dbUrl.searchParams.get('cnpj') || '').replace(/\D/g, '');
            if (!cnpj) return json({ links: [] });
            const r = await sb(env, `/purchase_links?select=supplier_code,product_id&supplier_cnpj=eq.${encodeURIComponent(cnpj)}`);
            return r.ok ? json({ links: r.body }) : fail('Erro ao ler os vínculos.', r);
          }

          // Lança a nota: cria/atualiza os produtos e guarda o XML, tudo ou nada
          if (request.method === 'POST' && dbRoute === '/compras') {
            const { note } = await request.json();
            const key = String(note?.access_key || '').replace(/\D/g, '');
            if (key.length !== 44 || !Array.isArray(note.items) || note.items.length === 0 || note.items.length > 2000) return json({ mensagem: 'Nota inválida.' }, 400);
            const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
            const items = note.items.map((i) => ({
              action: ['link', 'new', 'skip'].includes(i.action) ? i.action : 'skip',
              product_id: i.product_id ? String(i.product_id) : null,
              supplier_code: String(i.supplier_code || '').slice(0, 60),
              name: String(i.name || '').slice(0, 300),
              ean: String(i.ean || '').replace(/\D/g, '').slice(0, 14),
              ncm: String(i.ncm || '').replace(/\D/g, '').slice(0, 8),
              origin: String(i.origin || '0').slice(0, 1),
              unit: ['UN', 'KG', 'LT'].includes(i.unit) ? i.unit : 'UN',
              category: String(i.category || 'Outros').slice(0, 60),
              qty: Math.max(0, num(i.qty)),
              cost: Math.max(0, num(i.cost)),
              price: Math.max(0, num(i.price)),
              update_cost: i.update_cost !== false,
              update_price: i.update_price === true,
            }));
            if (items.some((i) => i.action === 'link' && !i.product_id)) return json({ mensagem: 'Há item vinculado sem produto.' }, 400);
            const payload = {
              access_key: key,
              number: String(note.number || '').slice(0, 20),
              series: String(note.series || '').slice(0, 10),
              issued_at: note.issued_at || '',
              supplier_name: String(note.supplier_name || '').slice(0, 200),
              supplier_cnpj: String(note.supplier_cnpj || '').replace(/\D/g, '').slice(0, 14),
              total: num(note.total),
              xml: String(note.xml || '').slice(0, 3000000),
              created_by: user.sub,
              items,
            };
            const r = await sb(env, '/rpc/register_purchase', { method: 'POST', body: JSON.stringify({ payload }) });
            if (!r.ok) return fail('Erro ao lançar a nota de compra.', r);
            return json(r.body, r.body.ok ? 201 : 409);
          }

          const one = /^\/compras\/([\w-]+)\/(xml|pdf)$/.exec(dbRoute);
          if (one) {
            const [, pid, kind] = one;
            if (kind === 'xml' && request.method === 'GET') {
              const r = await sb(env, `/purchases?id=eq.${encodeURIComponent(pid)}&select=xml,access_key`);
              if (!r.ok || !r.body[0]) return json({ mensagem: 'Nota não encontrada.' }, 404);
              return new Response(r.body[0].xml, { headers: { ...cors, 'Content-Type': 'application/xml; charset=utf-8' } });
            }
            if (kind === 'pdf' && request.method === 'PUT') {
              const bytes = await request.arrayBuffer();
              const head = new TextDecoder().decode(bytes.slice(0, 5));
              if (bytes.byteLength === 0 || bytes.byteLength > 15 * 1024 * 1024 || head !== '%PDF-') return json({ mensagem: 'Envie um arquivo PDF de até 15 MB.' }, 400);
              const ex = await sb(env, `/purchases?id=eq.${encodeURIComponent(pid)}&select=id`);
              if (!ex.ok || !ex.body[0]) return json({ mensagem: 'Nota não encontrada.' }, 404);
              const up = await storage(`${encodeURIComponent(pid)}.pdf`, { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: bytes });
              if (!up.ok) return json({ mensagem: 'Erro ao guardar o PDF.' }, 502);
              await sb(env, `/purchases?id=eq.${encodeURIComponent(pid)}`, { method: 'PATCH', body: JSON.stringify({ has_pdf: true }) });
              return json({ ok: true });
            }
            if (kind === 'pdf' && request.method === 'GET') {
              const f = await storage(`${encodeURIComponent(pid)}.pdf`);
              if (!f.ok) return json({ mensagem: 'PDF não encontrado.' }, 404);
              return new Response(f.body, { headers: { ...cors, 'Content-Type': 'application/pdf' } });
            }
          }
          return json({ mensagem: 'Rota não encontrada.' }, 404);
        }

        // ----- Agenda de Banho e Tosa / Clubinho: equipe vê tudo; cliente só o que é dele -----
        if (!role || ACCOUNTANT.includes(role)) return json({ mensagem: 'Acesso negado.' }, 403);

        if (request.method === 'GET' && dbRoute === '/agenda/events') {
          const from = new Date(dbUrl.searchParams.get('from') || '');
          const to = new Date(dbUrl.searchParams.get('to') || '');
          if (isNaN(from.getTime()) || isNaN(to.getTime())) return json({ mensagem: 'Período inválido.' }, 400);
          let path = `/appointments?select=*&starts_at=gte.${encodeURIComponent(from.toISOString())}&starts_at=lt.${encodeURIComponent(to.toISOString())}&order=starts_at.asc`;
          if (!isStaff) path += `&owner_id=eq.${encodeURIComponent(user.sub)}`;
          return json({ events: (await sbAll(env, path)).map(toAppt) });
        }

        if (request.method === 'POST' && dbRoute === '/agenda/events') {
          const input = await request.json();
          const start = new Date(input.start);
          const petName = String(input.petName || '').trim().slice(0, 120);
          if (!petName || isNaN(start.getTime())) return json({ mensagem: 'Informe o pet, a data e a hora.' }, 400);
          const count = Math.min(Math.max(Math.floor(Number(input.repeatCount) || 1), 1), 104);
          // Intervalo entre repetições em dias (7 = toda semana, o padrão de sempre; 14 = quinzenal, usado pelo Clubinho).
          const intervalDays = Math.min(Math.max(Math.floor(Number(input.repeatIntervalDays) || 7), 1), 90);
          const seriesId = count > 1 ? crypto.randomUUID() : null;
          const rows = Array.from({ length: count }, (_, i) => ({
            series_id: seriesId,
            pet_id: String(input.petId || ''),
            pet_name: petName,
            tutor_name: String(input.tutorName || '').slice(0, 120),
            owner_id: isStaff ? String(input.ownerId || '') : user.sub, // cliente só agenda para si mesmo
            service_type: String(input.serviceType || 'Banho & Tosa').slice(0, 60),
            status: 'Agendado',
            starts_at: new Date(start.getTime() + i * intervalDays * 86400000).toISOString(), // o Brasil não tem horário de verão
            duration_min: Math.min(Math.max(Math.floor(Number(input.durationMin) || 60), 5), 1440),
            notes: String(input.notes || '').slice(0, 4000),
            created_by: user.sub,
          }));
          const r = await sb(env, '/appointments', { method: 'POST', body: JSON.stringify(rows) });
          return r.ok ? json({ events: r.body.map(toAppt) }, 201) : fail('Erro ao criar o agendamento.', r);
        }

        // Importação em lote (arquivo .ics): só a equipe
        if (request.method === 'POST' && dbRoute === '/agenda/import') {
          if (!isStaff) return json({ mensagem: 'Acesso negado.' }, 403);
          const { items } = await request.json();
          if (!Array.isArray(items) || items.length === 0 || items.length > 500) return json({ mensagem: 'Requisição inválida.' }, 400);
          const rows = [];
          for (const it of items) {
            const start = new Date(it.startISO);
            const petName = String(it.petName || '').trim().slice(0, 120);
            if (!petName || isNaN(start.getTime())) continue;
            rows.push({
              series_id: it.seriesKey ? `ics:${String(it.seriesKey).slice(0, 200)}` : null,
              pet_id: String(it.petId || ''),
              pet_name: petName,
              tutor_name: String(it.tutorName || '').slice(0, 120),
              owner_id: String(it.ownerId || ''),
              service_type: String(it.serviceType || 'Banho & Tosa').slice(0, 60),
              status: APPT_STATUS.includes(it.status) ? it.status : 'Agendado',
              starts_at: start.toISOString(),
              duration_min: Math.min(Math.max(Math.floor(Number(it.durationMin) || 60), 5), 1440),
              notes: String(it.notes || '').slice(0, 4000),
              created_by: user.sub,
            });
          }
          if (rows.length === 0) return json({ inserted: 0 });
          const r = await sb(env, '/appointments', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal' } });
          return r.ok ? json({ inserted: rows.length }, 201) : fail('Erro ao importar os agendamentos.', r);
        }

        const one = /^\/agenda\/events\/([\w-]+)$/.exec(dbRoute);
        if (one && (request.method === 'PATCH' || request.method === 'DELETE')) {
          const id = encodeURIComponent(one[1]);
          const scope = dbUrl.searchParams.get('scope') === 'series' ? 'series' : 'this';
          const cur = await sb(env, `/appointments?id=eq.${id}&select=*`);
          if (!cur.ok) return fail('Erro ao buscar o agendamento.', cur);
          const row = cur.body[0];
          if (!row) return json({ mensagem: 'Agendamento não encontrado.' }, 404);
          if (!isStaff && row.owner_id !== user.sub) return json({ mensagem: 'Acesso negado.' }, 403);
          const whole = scope === 'series' && row.series_id;
          const where = whole ? `series_id=eq.${encodeURIComponent(row.series_id)}` : `id=eq.${id}`;

          if (request.method === 'DELETE') {
            const r = await sb(env, `/appointments?${where}`, { method: 'DELETE' });
            return r.ok ? json({ ok: true }) : fail('Erro ao excluir.', r);
          }

          const input = await request.json();
          const common = {};
          if (input.notes !== undefined) common.notes = String(input.notes).slice(0, 4000);
          if (input.serviceType !== undefined) common.service_type = String(input.serviceType).slice(0, 60);
          if (input.durationMin !== undefined) common.duration_min = Math.min(Math.max(Math.floor(Number(input.durationMin) || 60), 5), 1440);
          if (input.petName !== undefined) common.pet_name = String(input.petName).slice(0, 120);
          if (input.tutorName !== undefined) common.tutor_name = String(input.tutorName).slice(0, 120);
          if (isStaff && input.ownerId !== undefined) common.owner_id = String(input.ownerId);
          // Marcar "a confirmar"/"débito" num atendimento é coisa da equipe (fica visível na bolinha da agenda).
          if (isStaff && input.paymentFlag !== undefined) {
            if (input.paymentFlag !== null && !PAYMENT_FLAGS.includes(input.paymentFlag)) return json({ mensagem: 'Marcação de pagamento inválida.' }, 400);
            common.payment_flag = input.paymentFlag;
          }

          if (input.start) {
            const start = new Date(input.start);
            if (isNaN(start.getTime())) return json({ mensagem: 'Data inválida.' }, 400);
            if (whole) {
              const deltaSeconds = Math.round((start.getTime() - Date.parse(row.starts_at)) / 1000);
              const sh = await sb(env, '/rpc/shift_series', { method: 'POST', body: JSON.stringify({ sid: row.series_id, delta_seconds: deltaSeconds }) });
              if (!sh.ok) return fail('Erro ao reagendar a série.', sh);
            } else {
              // Reagendamento de uma única ocorrência do Clubinho (tutor avisou com antecedência, equipe move a
              // data): trava o número "banho X de N" na posição de ANTES de mover, pra não "pular" número quando
              // a nova data cai numa semana diferente do calendário. Só trava uma vez (não sobrescreve se já tinha).
              if (row.clubinho_cycle_position == null) {
                const sub = await findClubinhoSubForAppt(env, row);
                if (sub) {
                  const pos = clubinhoCyclePosition(sub, row.starts_at);
                  if (pos != null) common.clubinho_cycle_position = pos;
                }
              }
              common.starts_at = start.toISOString();
            }
          }
          if (isStaff && input.cancelReason !== undefined && input.cancelReason !== null && !CANCEL_REASONS.includes(input.cancelReason)) {
            return json({ mensagem: 'Motivo de cancelamento inválido.' }, 400);
          }
          // Situação (Em Andamento, Concluído...) e motivo de cancelamento valem só para o dia escolhido
          const single = {
            ...(input.status !== undefined && APPT_STATUS.includes(input.status) ? { status: input.status } : {}),
            ...(isStaff && input.cancelReason !== undefined ? { cancel_reason: input.cancelReason } : {}),
          };

          if (whole && Object.keys(common).length > 0) {
            const r = await sb(env, `/appointments?${where}`, { method: 'PATCH', body: JSON.stringify(common) });
            if (!r.ok) return fail('Erro ao salvar a série.', r);
          }
          const own = whole ? single : { ...common, ...single };
          if (Object.keys(own).length > 0) {
            const r = await sb(env, `/appointments?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(own) });
            if (!r.ok) return fail('Erro ao salvar.', r);
          }
          const after = await sb(env, `/appointments?id=eq.${id}&select=*`);
          return after.ok && after.body[0] ? json({ event: toAppt(after.body[0]) }) : fail('Erro ao ler o agendamento.', after);
        }

        return json({ mensagem: 'Rota não encontrada.' }, 404);
      }

      // ---- Clubinho (assinaturas recorrentes de banho e tosa) ----
      // Só a equipe cadastra/edita/renova. O cliente (quando o pet dele já estiver vinculado à conta) só pode VER
      // a própria assinatura — nunca criar ou renovar pelo próprio login.
      if (dbRoute === '/clubinho' || dbRoute.startsWith('/clubinho/')) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return json({ mensagem: 'Banco de dados não configurado.' }, 503);
        const failC = (mensagem, r) => json({ mensagem, detalhe: typeof r?.body === 'object' ? r.body?.message : undefined }, 502);
        const PLAN_TYPES = ['semanal', 'quinzenal'];

        if (request.method === 'GET' && dbRoute === '/clubinho') {
          if (isStaff) {
            const r = await sb(env, '/clubinho_subscriptions?select=*&order=renews_at.asc');
            if (!r.ok) return failC('Erro ao listar as assinaturas.', r);
            // Anexa o último pagamento registrado de cada assinatura, pra não precisar de uma busca à parte na tela.
            const pay = await sb(env, '/clubinho_payments?select=*&order=paid_date.desc,paid_time.desc');
            const lastBySub = new Map();
            if (pay.ok) for (const p of pay.body) if (!lastBySub.has(p.subscription_id)) lastBySub.set(p.subscription_id, p);
            return json({ assinaturas: r.body.map((s) => ({ ...s, last_payment: lastBySub.get(s.id) || null })) });
          }
          // Cliente: só as assinaturas dos pets que são dele.
          const myPets = await sb(env, `/pets?owner_id=eq.${encodeURIComponent(user.sub)}&select=id`);
          if (!myPets.ok) return failC('Erro ao buscar seus pets.', myPets);
          const ids = myPets.body.map((p) => p.id);
          if (ids.length === 0) return json({ assinaturas: [] });
          const filter = ids.map((id) => encodeURIComponent(id)).join(',');
          const r = await sb(env, `/clubinho_subscriptions?select=*&pet_id=in.(${filter})&order=renews_at.asc`);
          return r.ok ? json({ assinaturas: r.body }) : failC('Erro ao listar suas assinaturas.', r);
        }

        if (!isStaff) return json({ mensagem: 'Acesso negado.' }, 403);

        if (request.method === 'POST' && dbRoute === '/clubinho') {
          const input = await request.json();
          const petId = String(input.petId || '').trim();
          const petName = String(input.petName || '').trim().slice(0, 150);
          const startedAt = String(input.startedAt || '');
          const renewsAt = String(input.renewsAt || '');
          if (!petId || !petName || !startedAt || !renewsAt) return json({ mensagem: 'Informe o pet, a data de início e a de renovação.' }, 400);
          const fields = {
            pet_id: petId,
            pet_name: petName,
            tutor_name: String(input.tutorName || '').slice(0, 150),
            plan_type: PLAN_TYPES.includes(input.planType) ? input.planType : 'semanal',
            weekday: Number.isInteger(input.weekday) ? Math.min(Math.max(input.weekday, 0), 6) : null,
            time_of_day: String(input.timeOfDay || '').slice(0, 5),
            price: Math.max(0, Number(input.price) || 0),
            taxi_dog_fee: Math.max(0, Number(input.taxiDogFee) || 0),
            started_at: startedAt,
            renews_at: renewsAt,
            created_by: user.sub,
          };
          const r = await sb(env, '/clubinho_subscriptions', { method: 'POST', body: JSON.stringify(fields) });
          return r.ok ? json({ assinatura: r.body[0] }, 201) : failC('Erro ao cadastrar a assinatura.', r);
        }

        const renewMatch = /^\/clubinho\/([\w-]+)\/renovar$/.exec(dbRoute);
        if (request.method === 'POST' && renewMatch) {
          const id = renewMatch[1];
          const cur = await sb(env, `/clubinho_subscriptions?id=eq.${encodeURIComponent(id)}&select=*`);
          if (!cur.ok) return failC('Erro ao buscar a assinatura.', cur);
          const sub = cur.body[0];
          if (!sub) return json({ mensagem: 'Assinatura não encontrada.' }, 404);
          const input = await request.json();
          const newRenewsAt = String(input.renewsAt || '');
          if (!newRenewsAt) return json({ mensagem: 'Informe a nova data de renovação.' }, 400);

          // Renovar é a própria confirmação de pagamento: limpa qualquer marcação de "a confirmar"/"débito" anterior.
          const upd = await sb(env, `/clubinho_subscriptions?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH', body: JSON.stringify({ renews_at: newRenewsAt, is_active: true, payment_flag: null }),
          });
          if (!upd.ok) return failC('Erro ao renovar a assinatura.', upd);

          let created = 0;
          if (input.createAppointments !== false && sub.weekday !== null && sub.time_of_day) {
            const intervalDays = sub.plan_type === 'quinzenal' ? 14 : 7;
            // Primeira ocorrência: a próxima data (a partir de amanhã) que cai no dia da semana certo.
            const [hh, mm] = sub.time_of_day.split(':').map((n) => parseInt(n, 10) || 0);
            const today = new Date();
            let first = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, hh, mm);
            while (first.getDay() !== sub.weekday) first = new Date(first.getTime() + 86400000);
            const end = new Date(newRenewsAt + 'T23:59:59');
            const rows = [];
            const seriesId = crypto.randomUUID();
            for (let d = first; d <= end; d = new Date(d.getTime() + intervalDays * 86400000)) {
              rows.push({
                series_id: seriesId,
                pet_id: sub.pet_id,
                pet_name: sub.pet_name,
                tutor_name: sub.tutor_name,
                owner_id: '',
                service_type: 'Banho & Tosa',
                status: 'Agendado',
                starts_at: d.toISOString(),
                duration_min: 60,
                notes: 'Gerado automaticamente pela renovação do Clubinho.',
                created_by: user.sub,
              });
            }
            if (rows.length > 0) {
              const r = await sb(env, '/appointments', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal' } });
              if (r.ok) created = rows.length;
            }
          }
          const after = await sb(env, `/clubinho_subscriptions?id=eq.${encodeURIComponent(id)}&select=*`);
          return json({ assinatura: after.body?.[0] || null, agendamentos_criados: created });
        }

        // Registra um pagamento (data/hora/forma/quem recebeu) e marca a assinatura como "Pagamento realizado".
        const payMatch = /^\/clubinho\/([\w-]+)\/pagamento$/.exec(dbRoute);
        if (request.method === 'POST' && payMatch) {
          const id = payMatch[1];
          const cur = await sb(env, `/clubinho_subscriptions?id=eq.${encodeURIComponent(id)}&select=id`);
          if (!cur.ok) return failC('Erro ao buscar a assinatura.', cur);
          if (!cur.body[0]) return json({ mensagem: 'Assinatura não encontrada.' }, 404);
          const input = await request.json();
          const paidDate = String(input.paidDate || '');
          const paidTime = String(input.paidTime || '').slice(0, 5);
          const method = String(input.paymentMethod || '');
          const receivedBy = String(input.receivedBy || '').trim().slice(0, 150);
          if (!paidDate || !paidTime || !receivedBy) return json({ mensagem: 'Informe a data, a hora e quem recebeu o pagamento.' }, 400);
          if (!PAYMENT_METHODS.includes(method)) return json({ mensagem: 'Forma de pagamento inválida.' }, 400);
          const insert = await sb(env, '/clubinho_payments', {
            method: 'POST',
            body: JSON.stringify({ subscription_id: id, paid_date: paidDate, paid_time: paidTime, payment_method: method, received_by: receivedBy, created_by: user.sub }),
          });
          if (!insert.ok) return failC('Erro ao registrar o pagamento.', insert);
          const upd = await sb(env, `/clubinho_subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ payment_flag: 'pago' }) });
          if (!upd.ok) return failC('Erro ao marcar o pagamento na assinatura.', upd);
          return json({ assinatura: upd.body?.[0] || null, pagamento: insert.body[0] }, 201);
        }

        const one = /^\/clubinho\/([\w-]+)$/.exec(dbRoute);
        if (one && request.method === 'PATCH') {
          const input = await request.json();
          const fields = {};
          if (input.planType !== undefined) fields.plan_type = PLAN_TYPES.includes(input.planType) ? input.planType : 'semanal';
          if (input.weekday !== undefined) fields.weekday = Number.isInteger(input.weekday) ? Math.min(Math.max(input.weekday, 0), 6) : null;
          if (input.timeOfDay !== undefined) fields.time_of_day = String(input.timeOfDay).slice(0, 5);
          if (input.price !== undefined) fields.price = Math.max(0, Number(input.price) || 0);
          if (input.taxiDogFee !== undefined) fields.taxi_dog_fee = Math.max(0, Number(input.taxiDogFee) || 0);
          if (input.tutorName !== undefined) fields.tutor_name = String(input.tutorName).slice(0, 150);
          if (input.renewsAt !== undefined) fields.renews_at = String(input.renewsAt);
          if (input.startedAt !== undefined) fields.started_at = String(input.startedAt);
          if (input.isActive !== undefined) fields.is_active = !!input.isActive;
          if (input.paymentFlag !== undefined) {
            if (input.paymentFlag !== null && !PAYMENT_FLAGS.includes(input.paymentFlag)) return json({ mensagem: 'Marcação de pagamento inválida.' }, 400);
            fields.payment_flag = input.paymentFlag;
          }
          if (Object.keys(fields).length === 0) return json({ mensagem: 'Nada para alterar.' }, 400);
          const r = await sb(env, `/clubinho_subscriptions?id=eq.${encodeURIComponent(one[1])}`, { method: 'PATCH', body: JSON.stringify(fields) });
          if (!r.ok) return failC('Erro ao salvar a assinatura.', r);
          return r.body.length ? json({ assinatura: r.body[0] }) : json({ mensagem: 'Assinatura não encontrada.' }, 404);
        }

        if (one && request.method === 'DELETE') {
          // Não apaga o histórico: só marca como inativa (cliente cancelou o Clubinho).
          const r = await sb(env, `/clubinho_subscriptions?id=eq.${encodeURIComponent(one[1])}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
          return r.ok ? json({ ok: true }) : failC('Erro ao cancelar a assinatura.', r);
        }

        return json({ mensagem: 'Rota não encontrada.' }, 404);
      }

      // Um token por ambiente (teste/real); se só houver o token único, ele serve para os dois.
      const authFor = (ambiente) => 'Basic ' + btoa(`${env[`FOCUS_NFE_TOKEN_${String(ambiente).toUpperCase()}`] || env.FOCUS_NFE_TOKEN}:`);
      const url = new URL(request.url);
      const route = url.pathname.replace(/\/+$/, '');

      if (request.method === 'POST' && route === '/nfce') {
        const { ref, ambiente, payload } = await request.json();
        const host = FOCUS_HOSTS[ambiente];
        if (!host || !ref || !payload) return json({ mensagem: 'Requisição inválida.' }, 400);
        const r = await fetch(`${host}/v2/nfce?ref=${encodeURIComponent(ref)}`, {
          method: 'POST',
          headers: { Authorization: authFor(ambiente), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return json(absolutize(await r.json().catch(() => ({})), host), r.status);
      }

      if (request.method === 'GET' && route === '/ping') return json({ ok: true });

      // Aviso de nova entrega para o celular do entregador (só a equipe pode disparar).
      if (request.method === 'POST' && route === '/push') {
        const { endpoint } = await request.json();
        if (!endpoint || !env.VAPID_PRIVATE_JWK) return json({ mensagem: 'Requisição inválida.' }, 400);
        let r;
        try {
          r = await sendWebPush(endpoint, env);
        } catch (e) {
          return json({ mensagem: 'Endereço de push inválido.' }, 400);
        }
        // 404/410: o aparelho cancelou o aviso; quem chamou deve apagar essa inscrição.
        return json({ ok: r.ok, status: r.status, gone: r.status === 404 || r.status === 410 });
      }

      // Entrega o conteúdo de um arquivo da Focus (XML da nota) para o navegador, que não consegue buscá-lo direto.
      if (request.method === 'GET' && route === '/arquivo') {
        const host = FOCUS_HOSTS[url.searchParams.get('ambiente')];
        const caminho = url.searchParams.get('caminho') || '';
        const target = caminho.startsWith('/') ? host + caminho : caminho;
        if (!host || !target.startsWith(host + '/arquivos/')) return json({ mensagem: 'Arquivo inválido.' }, 400);
        const r = await fetch(target, { headers: { Authorization: authFor(url.searchParams.get('ambiente')) } });
        return new Response(r.body, { status: r.status, headers: { ...cors, 'Content-Type': r.headers.get('Content-Type') || 'application/xml' } });
      }

      const del = /^\/nfce\/([\w-]+)$/.exec(route);
      if (request.method === 'DELETE' && del) {
        const { ambiente, justificativa } = await request.json();
        const host = FOCUS_HOSTS[ambiente];
        if (!host || !justificativa) return json({ mensagem: 'Requisição inválida.' }, 400);
        const r = await fetch(`${host}/v2/nfce/${del[1]}`, {
          method: 'DELETE',
          headers: { Authorization: authFor(ambiente), 'Content-Type': 'application/json' },
          body: JSON.stringify({ justificativa }),
        });
        return json(absolutize(await r.json().catch(() => ({})), host), r.status);
      }

      const get = /^\/nfce\/([\w-]+)$/.exec(route);
      if (request.method === 'GET' && get) {
        const host = FOCUS_HOSTS[url.searchParams.get('ambiente')];
        if (!host) return json({ mensagem: 'Ambiente inválido.' }, 400);
        const r = await fetch(`${host}/v2/nfce/${get[1]}?completa=0`, { headers: { Authorization: authFor(url.searchParams.get('ambiente')) } });
        return json(absolutize(await r.json().catch(() => ({})), host), r.status);
      }

      return json({ mensagem: 'Rota não encontrada.' }, 404);
    } catch (e) {
      console.error(e);
      return json({ mensagem: 'Não autorizado ou erro interno no serviço de emissão.' }, 401);
    }
  },
};
