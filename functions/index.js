// Proxy de emissão de NFC-e (Focus NFe). O token fica no Secret Manager, nunca no front.
//
// Deploy (uma vez):
//   firebase functions:secrets:set FOCUS_NFE_TOKEN        (token da conta Focus NFe)
//   cd functions && npm install && cd ..
//   firebase deploy --only functions
// Depois cole a URL da função `fiscal` em Configurações > Fiscal.
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const FOCUS_TOKEN = defineSecret('FOCUS_NFE_TOKEN');

const HOSTS = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao: 'https://api.focusnfe.com.br',
};
const STAFF = ['desenvolvedor', 'proprietaria', 'gerente', 'colaborador', 'developer', 'owner', 'manager', 'collaborator'];

async function requireStaff(req) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return null;
  const decoded = await admin.auth().verifyIdToken(m[1]);
  const profile = await admin.firestore().doc(`profiles/${decoded.uid}`).get();
  return profile.exists && STAFF.includes(profile.data().role) ? decoded : null;
}

// A Focus devolve caminhos relativos (/arquivos/...); completamos com o host do ambiente.
function absolutize(body, host) {
  for (const k of ['caminho_danfe', 'caminho_xml_nota_fiscal', 'caminho_xml_cancelamento', 'url_danfe']) {
    if (body && typeof body[k] === 'string' && body[k].startsWith('/')) body[k] = host + body[k];
  }
  return body;
}

exports.fiscal = onRequest(
  { secrets: [FOCUS_TOKEN], cors: true, region: 'southamerica-east1', timeoutSeconds: 60 },
  async (req, res) => {
    try {
      if (!(await requireStaff(req))) return res.status(403).json({ mensagem: 'Acesso negado.' });

      const auth = 'Basic ' + Buffer.from(`${FOCUS_TOKEN.value()}:`).toString('base64');
      const route = req.path.replace(/\/+$/, '');

      if (req.method === 'POST' && route === '/nfce') {
        const { ref, ambiente, payload } = req.body || {};
        const host = HOSTS[ambiente];
        if (!host || !ref || !payload) return res.status(400).json({ mensagem: 'Requisição inválida.' });
        const r = await fetch(`${host}/v2/nfce?ref=${encodeURIComponent(ref)}`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return res.status(r.status).json(absolutize(await r.json().catch(() => ({})), host));
      }

      if (req.method === 'GET' && route === '/ping') return res.json({ ok: true });

      if (req.method === 'GET' && route === '/arquivo') {
        const host = HOSTS[req.query.ambiente];
        const caminho = String(req.query.caminho || '');
        const target = caminho.startsWith('/') ? host + caminho : caminho;
        if (!host || !target.startsWith(host + '/arquivos/')) return res.status(400).json({ mensagem: 'Arquivo inválido.' });
        const r = await fetch(target, { headers: { Authorization: auth } });
        res.status(r.status).type(r.headers.get('Content-Type') || 'application/xml');
        return res.send(Buffer.from(await r.arrayBuffer()));
      }

      const del = /^\/nfce\/([\w-]+)$/.exec(route);
      if (req.method === 'DELETE' && del) {
        const { ambiente, justificativa } = req.body || {};
        const host = HOSTS[ambiente];
        if (!host || !justificativa) return res.status(400).json({ mensagem: 'Requisição inválida.' });
        const r = await fetch(`${host}/v2/nfce/${del[1]}`, {
          method: 'DELETE',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ justificativa }),
        });
        return res.status(r.status).json(absolutize(await r.json().catch(() => ({})), host));
      }

      const get = /^\/nfce\/([\w-]+)$/.exec(route);
      if (req.method === 'GET' && get) {
        const host = HOSTS[req.query.ambiente];
        if (!host) return res.status(400).json({ mensagem: 'Ambiente inválido.' });
        const r = await fetch(`${host}/v2/nfce/${get[1]}?completa=0`, { headers: { Authorization: auth } });
        return res.status(r.status).json(absolutize(await r.json().catch(() => ({})), host));
      }

      return res.status(404).json({ mensagem: 'Rota não encontrada.' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ mensagem: 'Erro interno no serviço de emissão.' });
    }
  }
);
