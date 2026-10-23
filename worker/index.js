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
  if (!r.ok) return null;
  return (await r.json()).fields?.role?.stringValue || null;
}

// ---- Google Agenda (fonte de dados da agenda de Banho e Tosa / Clubinho) ---------------------------------------
// Conta de serviço (segredo GOOGLE_AGENDA_SA) com acesso à agenda compartilhada com ela. O operador nunca precisa abrir o Google Agenda.
const TZ = 'America/Sao_Paulo';
let gToken = { value: '', exp: 0 };
const roleCache = new Map();

async function googleAccessToken(env) {
  if (gToken.value && gToken.exp > Date.now() + 60000) return gToken.value;
  const sa = JSON.parse(env.GOOGLE_AGENDA_SA);
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('google auth: ' + (j.error_description || j.error));
  gToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return gToken.value;
}

async function gcal(env, path, init = {}) {
  const token = await googleAccessToken(env);
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.AGENDA_CALENDAR_ID)}`;
  const r = await fetch(base + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = r.status === 204 ? {} : await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, body };
}

// Evento do Google -> formato simples que a tela usa
function toAgendaEvent(e) {
  const priv = e.extendedProperties?.private || {};
  return {
    id: e.id,
    recurringEventId: e.recurringEventId || null,
    summary: e.summary || '',
    description: e.description || '',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: !e.start?.dateTime,
    pet_id: priv.lv_pet_id || '',
    owner_id: priv.lv_owner || '',
    service_type: priv.lv_service || '',
    status: priv.lv_status || '',
    created: e.created,
    updated: e.updated,
  };
}

function eventBody(input, uid, isStaff, existing) {
  const out = {};
  if (input.summary !== undefined) out.summary = String(input.summary).slice(0, 300);
  if (input.description !== undefined) out.description = String(input.description).slice(0, 4000);
  if (input.start) {
    const start = new Date(input.start);
    if (isNaN(start.getTime())) throw new Error('data inválida');
    const dur = Math.min(Math.max(Number(input.durationMin) || 60, 5), 24 * 60);
    out.start = { dateTime: start.toISOString(), timeZone: TZ };
    out.end = { dateTime: new Date(start.getTime() + dur * 60000).toISOString(), timeZone: TZ };
  }
  const priv = {};
  if (input.pet_id !== undefined) priv.lv_pet_id = String(input.pet_id);
  if (input.service_type !== undefined) priv.lv_service = String(input.service_type);
  if (input.status !== undefined) priv.lv_status = String(input.status);
  // Cliente só mexe no que é dele; a equipe pode indicar o dono.
  if (!existing) priv.lv_owner = isStaff ? String(input.owner_id || '') : uid;
  else if (isStaff && input.owner_id !== undefined) priv.lv_owner = String(input.owner_id);
  if (Object.keys(priv).length) out.extendedProperties = { private: priv };
  if (!existing && input.repeatCount > 1) out.recurrence = [`RRULE:FREQ=WEEKLY;COUNT=${Math.min(Math.floor(input.repeatCount), 104)}`];
  return out;
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
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
        cached = { role: await getRole(user.sub, env.FIREBASE_PROJECT_ID), exp: Date.now() + 5 * 60000 };
        roleCache.set(user.sub, cached);
      }
      const role = cached.role;
      const isStaff = STAFF.includes(role);

      // ---- Agenda (Google Agenda como fonte de dados) ----
      const agendaUrl = new URL(request.url);
      const agendaRoute = agendaUrl.pathname.replace(/\/+$/, '');
      if (agendaRoute.startsWith('/agenda/')) {
        if (!role || ACCOUNTANT.includes(role)) return json({ mensagem: 'Acesso negado.' }, 403);
        if (!env.GOOGLE_AGENDA_SA || !env.AGENDA_CALENDAR_ID) return json({ mensagem: 'Agenda não configurada.' }, 503);

        if (request.method === 'GET' && agendaRoute === '/agenda/events') {
          const from = new Date(agendaUrl.searchParams.get('from') || '');
          const to = new Date(agendaUrl.searchParams.get('to') || '');
          if (isNaN(from.getTime()) || isNaN(to.getTime())) return json({ mensagem: 'Período inválido.' }, 400);
          const events = [];
          let pageToken = '';
          for (let i = 0; i < 6; i++) {
            const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', showDeleted: 'false' });
            if (!isStaff) q.append('privateExtendedProperty', `lv_owner=${user.sub}`);
            if (pageToken) q.set('pageToken', pageToken);
            const r = await gcal(env, `/events?${q}`);
            if (!r.ok) return json({ mensagem: 'Erro ao ler a agenda.', detalhe: r.body.error?.message, status: r.status }, r.status === 404 ? 404 : 502);
            events.push(...(r.body.items || []).filter((e) => e.status !== 'cancelled').map(toAgendaEvent));
            pageToken = r.body.nextPageToken || '';
            if (!pageToken) break;
          }
          return json({ events });
        }

        if (request.method === 'POST' && agendaRoute === '/agenda/events') {
          const input = await request.json();
          if (!input.start) return json({ mensagem: 'Informe a data e a hora.' }, 400);
          const r = await gcal(env, '/events', { method: 'POST', body: JSON.stringify(eventBody({ ...input, summary: input.summary || 'Sem título' }, user.sub, isStaff, null)) });
          if (!r.ok) return json({ mensagem: 'Erro ao criar o agendamento.', detalhe: r.body.error?.message }, 502);
          return json({ event: toAgendaEvent(r.body) }, 201);
        }

        const one = /^\/agenda\/events\/([\w-]+)$/.exec(agendaRoute);
        if (one && (request.method === 'PATCH' || request.method === 'DELETE')) {
          const id = one[1];
          const scope = (agendaUrl.searchParams.get('scope') || 'this') === 'series' ? 'series' : 'this';
          const cur = await gcal(env, `/events/${id}`);
          if (!cur.ok) return json({ mensagem: 'Agendamento não encontrado.' }, 404);
          if (!isStaff && cur.body.extendedProperties?.private?.lv_owner !== user.sub) return json({ mensagem: 'Acesso negado.' }, 403);
          const masterId = cur.body.recurringEventId;
          const targetId = scope === 'series' && masterId ? masterId : id;

          if (request.method === 'DELETE') {
            const r = await gcal(env, `/events/${targetId}?sendUpdates=none`, { method: 'DELETE' });
            return r.ok || r.status === 410 ? json({ ok: true }) : json({ mensagem: 'Erro ao excluir.', detalhe: r.body.error?.message }, 502);
          }

          const input = await request.json();
          const patch = eventBody(input, user.sub, isStaff, cur.body);
          if (scope === 'series' && masterId && patch.start) {
            // Mover a série inteira: desloca o início da série pela mesma diferença da ocorrência escolhida.
            const master = await gcal(env, `/events/${masterId}`);
            if (!master.ok) return json({ mensagem: 'Série não encontrada.' }, 404);
            const delta = new Date(patch.start.dateTime).getTime() - new Date(cur.body.start.dateTime).getTime();
            const ms = new Date(master.body.start.dateTime).getTime() + delta;
            const dur = new Date(patch.end.dateTime).getTime() - new Date(patch.start.dateTime).getTime();
            patch.start = { dateTime: new Date(ms).toISOString(), timeZone: TZ };
            patch.end = { dateTime: new Date(ms + dur).toISOString(), timeZone: TZ };
          }
          const r = await gcal(env, `/events/${targetId}?sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(patch) });
          if (!r.ok) return json({ mensagem: 'Erro ao salvar.', detalhe: r.body.error?.message }, 502);
          return json({ event: toAgendaEvent(r.body) });
        }

        return json({ mensagem: 'Rota não encontrada.' }, 404);
      }

      // O contador só consulta e baixa arquivos; emitir e cancelar é só da equipe.
      if (!isStaff && !(ACCOUNTANT.includes(role) && request.method === 'GET')) return json({ mensagem: 'Acesso negado.' }, 403);

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
