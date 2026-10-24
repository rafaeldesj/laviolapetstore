// Proxy de emissão de NFC-e (Focus NFe) em Cloudflare Workers. O token da Focus fica em segredo aqui.
//
// Deploy (uma vez, grátis):
//   cd worker
//   npx wrangler login
//   npx wrangler secret put FOCUS_NFE_TOKEN_HOMOLOGACAO   (token do modo de teste da Focus NFe)
//   npx wrangler secret put FOCUS_NFE_TOKEN_PRODUCAO      (token do modo real; só quando for valer)
//   (se a Focus der um token único, use só: npx wrangler secret put FOCUS_NFE_TOKEN)
//   npx wrangler deploy
// A URL final (https://laviola-fiscal.<sua-conta>.workers.dev) vai em Configurações > Nota Fiscal.

const FOCUS_HOSTS = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao: 'https://api.focusnfe.com.br',
};
const ACCOUNTANT = ['contador', 'accountant'];
const STAFF = ['desenvolvedor', 'proprietaria', 'gerente', 'colaborador', 'developer', 'owner', 'manager', 'collaborator'];
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

// profiles/{uid} tem leitura aberta nas regras do Firestore, então basta a REST pública.
async function getRole(uid, projectId) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/profiles/${uid}`);
  if (r.status === 404) return null; // perfil não existe: sem cargo
  if (!r.ok) throw new Error('cargo indisponível'); // erro do Firestore (limite diário, instabilidade): não confundir com "sem cargo"
  return (await r.json()).fields?.role?.stringValue || null;
}

// ---- Supabase (produtos e agenda) -------------------------------------------------------------------------------
// O navegador nunca fala com o Supabase: tudo passa por aqui. O Worker confere quem é o usuário e o cargo, e só então
// usa a chave de serviço (segredo SUPABASE_SERVICE_ROLE), que ignora o RLS das tabelas.
const roleCache = new Map();

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
  created_at: row.created_at,
});

const APPT_STATUS = ['Agendado', 'Em Andamento', 'Concluído', 'Cancelado'];

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
      const bearer = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
      if (!bearer) return json({ mensagem: 'Acesso negado.' }, 401);
      const user = await verifyFirebaseToken(bearer[1], env.FIREBASE_PROJECT_ID);
      let cached = roleCache.get(user.sub);
      if (!cached || cached.exp < Date.now()) {
        try {
          cached = { role: await getRole(user.sub, env.FIREBASE_PROJECT_ID), exp: Date.now() + 5 * 60000 };
          roleCache.set(user.sub, cached);
        } catch (e) {
          // Sem conseguir confirmar o cargo agora: usa o último conhecido (se houver) em vez de negar o acesso.
          if (!cached) return json({ mensagem: 'Não foi possível confirmar o seu cargo agora (o cadastro de usuários está indisponível). Tente de novo em alguns minutos.' }, 503);
        }
      }
      const role = cached.role;
      const isStaff = STAFF.includes(role);

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
          const seriesId = count > 1 ? crypto.randomUUID() : null;
          const rows = Array.from({ length: count }, (_, i) => ({
            series_id: seriesId,
            pet_id: String(input.petId || ''),
            pet_name: petName,
            tutor_name: String(input.tutorName || '').slice(0, 120),
            owner_id: isStaff ? String(input.ownerId || '') : user.sub, // cliente só agenda para si mesmo
            service_type: String(input.serviceType || 'Banho & Tosa').slice(0, 60),
            status: 'Agendado',
            starts_at: new Date(start.getTime() + i * 7 * 86400000).toISOString(), // o Brasil não tem horário de verão
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

          if (input.start) {
            const start = new Date(input.start);
            if (isNaN(start.getTime())) return json({ mensagem: 'Data inválida.' }, 400);
            if (whole) {
              const deltaSeconds = Math.round((start.getTime() - Date.parse(row.starts_at)) / 1000);
              const sh = await sb(env, '/rpc/shift_series', { method: 'POST', body: JSON.stringify({ sid: row.series_id, delta_seconds: deltaSeconds }) });
              if (!sh.ok) return fail('Erro ao reagendar a série.', sh);
            } else {
              common.starts_at = start.toISOString();
            }
          }
          // Situação (Em Andamento, Concluído...) vale só para o dia escolhido
          const single = { ...(input.status !== undefined && APPT_STATUS.includes(input.status) ? { status: input.status } : {}) };

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
