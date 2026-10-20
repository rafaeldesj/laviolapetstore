// Proxy de emissão de NFC-e (Focus NFe) em Cloudflare Workers. O token da Focus fica em segredo aqui.
//
// Deploy (uma vez, grátis):
//   cd worker
//   npx wrangler login
//   npx wrangler secret put FOCUS_NFE_TOKEN      (cole o token da conta Focus NFe)
//   npx wrangler deploy
// A URL final (https://laviola-fiscal.<sua-conta>.workers.dev) vai em Configurações > Nota Fiscal.

const FOCUS_HOSTS = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao: 'https://api.focusnfe.com.br',
};
const ACCOUNTANT = ['contador', 'accountant'];
const STAFF = ['desenvolvedor', 'proprietaria', 'gerente', 'colaborador', 'developer', 'owner', 'manager', 'collaborator'];
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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
      const role = await getRole(user.sub, env.FIREBASE_PROJECT_ID);
      const isStaff = STAFF.includes(role);
      // O contador só consulta e baixa arquivos; emitir e cancelar é só da equipe.
      if (!isStaff && !(ACCOUNTANT.includes(role) && request.method === 'GET')) return json({ mensagem: 'Acesso negado.' }, 403);

      const auth = 'Basic ' + btoa(`${env.FOCUS_NFE_TOKEN}:`);
      const url = new URL(request.url);
      const route = url.pathname.replace(/\/+$/, '');

      if (request.method === 'POST' && route === '/nfce') {
        const { ref, ambiente, payload } = await request.json();
        const host = FOCUS_HOSTS[ambiente];
        if (!host || !ref || !payload) return json({ mensagem: 'Requisição inválida.' }, 400);
        const r = await fetch(`${host}/v2/nfce?ref=${encodeURIComponent(ref)}`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return json(absolutize(await r.json().catch(() => ({})), host), r.status);
      }

      if (request.method === 'GET' && route === '/ping') return json({ ok: true });

      // Entrega o conteúdo de um arquivo da Focus (XML da nota) para o navegador, que não consegue buscá-lo direto.
      if (request.method === 'GET' && route === '/arquivo') {
        const host = FOCUS_HOSTS[url.searchParams.get('ambiente')];
        const caminho = url.searchParams.get('caminho') || '';
        const target = caminho.startsWith('/') ? host + caminho : caminho;
        if (!host || !target.startsWith(host + '/arquivos/')) return json({ mensagem: 'Arquivo inválido.' }, 400);
        const r = await fetch(target, { headers: { Authorization: auth } });
        return new Response(r.body, { status: r.status, headers: { ...cors, 'Content-Type': r.headers.get('Content-Type') || 'application/xml' } });
      }

      const del = /^\/nfce\/([\w-]+)$/.exec(route);
      if (request.method === 'DELETE' && del) {
        const { ambiente, justificativa } = await request.json();
        const host = FOCUS_HOSTS[ambiente];
        if (!host || !justificativa) return json({ mensagem: 'Requisição inválida.' }, 400);
        const r = await fetch(`${host}/v2/nfce/${del[1]}`, {
          method: 'DELETE',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ justificativa }),
        });
        return json(absolutize(await r.json().catch(() => ({})), host), r.status);
      }

      const get = /^\/nfce\/([\w-]+)$/.exec(route);
      if (request.method === 'GET' && get) {
        const host = FOCUS_HOSTS[url.searchParams.get('ambiente')];
        if (!host) return json({ mensagem: 'Ambiente inválido.' }, 400);
        const r = await fetch(`${host}/v2/nfce/${get[1]}?completa=0`, { headers: { Authorization: auth } });
        return json(absolutize(await r.json().catch(() => ({})), host), r.status);
      }

      return json({ mensagem: 'Rota não encontrada.' }, 404);
    } catch (e) {
      console.error(e);
      return json({ mensagem: 'Não autorizado ou erro interno no serviço de emissão.' }, 401);
    }
  },
};
