import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseClient';
import type { ReceiptCompany, ReceiptFiscal } from './printer';
import { DEFAULT_COMPANY } from './printer';
import { updateSaleFiscal } from './salesService';
import type { Sale } from './salesService';

/**
 * Emissão de NFC-e via Focus NFe. O token do provedor NUNCA fica no navegador:
 * o front chama o proxy (worker/index.js, grátis; functions/index.js é a alternativa no plano Blaze), que fala com a Focus NFe.
 */
export interface FiscalSettings {
  enabled: boolean;
  /** Regime tributário da empresa, confirmado com o contador. Só 'simples' é suportado. */
  regime: '' | 'simples' | 'outro';
  /** Validade do certificado digital (AAAA-MM-DD), para o aviso de renovação. */
  cert_validade: string;
  /** Prazo para cancelar uma nota depois de emitida (RJ: 24 horas). */
  cancel_horas: number;
  ambiente: 'homologacao' | 'producao';
  /** URL base da Cloud Function `fiscal` (ex.: https://southamerica-east1-<projeto>.cloudfunctions.net/fiscal) */
  endpoint: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  ie: string;
  endereco: string;
  telefone: string;
  /** Simples Nacional/MEI usa CSOSN (ex.: 102). Regime normal usa CST e não é coberto aqui. */
  csosn: string;
  cfop: string;
  unidade: string;
  /** Usado só quando o produto não tem NCM cadastrado. Deixe vazio para exigir o NCM em cada produto. */
  ncm_padrao: string;
}

export const DEFAULT_FISCAL_SETTINGS: FiscalSettings = {
  enabled: false,
  regime: 'simples', // confirmado pelo contador em 20/10/2026
  cert_validade: '',
  cancel_horas: 24,
  ambiente: 'homologacao',
  endpoint: '',
  cnpj: '',
  razao_social: '',
  nome_fantasia: 'La Viola Petshop',
  ie: '',
  endereco: DEFAULT_COMPANY.address || '',
  telefone: DEFAULT_COMPANY.phone || '',
  csosn: '102',
  cfop: '5102',
  unidade: 'UN',
  ncm_padrao: '',
};

const LOCAL_KEY = 'laviola_fiscal_settings';

export async function getFiscalSettings(): Promise<FiscalSettings> {
  let cached: Partial<FiscalSettings> = {};
  try {
    cached = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  } catch { /* ignora cache corrompido */ }

  if (db) {
    try {
      const snap = await getDoc(doc(db, 'settings', 'fiscal'));
      if (snap.exists()) {
        const remote = snap.data() as Partial<FiscalSettings>;
        localStorage.setItem(LOCAL_KEY, JSON.stringify(remote));
        return { ...DEFAULT_FISCAL_SETTINGS, ...remote };
      }
    } catch (e) {
      console.warn('Configuração fiscal indisponível no Firestore, usando cache local:', e);
    }
  }
  return { ...DEFAULT_FISCAL_SETTINGS, ...cached };
}

export async function saveFiscalSettings(settings: FiscalSettings): Promise<void> {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
  if (!db) return;
  await setDoc(doc(db, 'settings', 'fiscal'), settings);
}

export function companyFromSettings(s: FiscalSettings): ReceiptCompany {
  return {
    name: (s.nome_fantasia || s.razao_social || DEFAULT_COMPANY.name).toUpperCase(),
    cnpj: s.cnpj || undefined,
    ie: s.ie || undefined,
    address: s.endereco || DEFAULT_COMPANY.address,
    phone: s.telefone || DEFAULT_COMPANY.phone,
  };
}

// ---- Validações ----
export function isValidCpf(value: string): boolean {
  const d = value.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(value: string): boolean {
  const d = value.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isValidCpfOrCnpj(value: string): boolean {
  const d = value.replace(/\D/g, '');
  return d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false;
}

const PAYMENT_CODES: Record<string, string> = {
  'Dinheiro': '01',
  'Cartão de Crédito': '03',
  'Cartão de Débito': '04',
  'Pix': '17',
};

/** Fuso do navegador no formato exigido pela SEFAZ (-03:00). */
function isoWithOffset(date: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const local = new Date(date.getTime() + off * 60000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

export function validateSaleForNfce(sale: Sale, cfg: FiscalSettings): string[] {
  const problems: string[] = [];
  if (cfg.regime === 'outro') problems.push('O sistema ainda só emite notas para empresas do Simples Nacional. Fale com o desenvolvedor.');
  else if (cfg.regime !== 'simples') problems.push('Falta informar o regime da empresa (Simples Nacional ou outro) em Configurações → Nota Fiscal. Pergunte ao contador.');
  if (!cfg.enabled) problems.push('A emissão de notas ainda não foi ligada (Configurações → Nota Fiscal).');
  if (!cfg.endpoint.trim()) problems.push('O endereço do emissor de notas ainda não foi configurado (Configurações → Nota Fiscal).');
  if (!isValidCnpj(cfg.cnpj)) problems.push('O CNPJ da empresa está em branco ou errado (Configurações → Nota Fiscal).');
  if (sale.client.cpf_cnpj && !isValidCpfOrCnpj(sale.client.cpf_cnpj)) problems.push('O CPF/CNPJ do cliente está errado.');
  if (!PAYMENT_CODES[sale.payment_method]) problems.push(`A forma de pagamento "${sale.payment_method}" não pode ser usada na nota.`);
  sale.items.forEach(i => {
    const ncm = (i.ncm || cfg.ncm_padrao || '').replace(/\D/g, '');
    if (ncm.length !== 8) problems.push(`O produto "${i.name}" está sem NCM. Preencha em Estoque → "Preencher NCM por planilha".`);
  });
  return problems;
}

export function buildNfcePayload(sale: Sale, cfg: FiscalSettings) {
  const doc = sale.client.cpf_cnpj.replace(/\D/g, '');
  return {
    natureza_operacao: 'VENDA AO CONSUMIDOR',
    data_emissao: isoWithOffset(new Date()),
    presenca_comprador: '1',
    modalidade_frete: '9',
    local_destino: '1',
    cnpj_emitente: cfg.cnpj.replace(/\D/g, ''),
    ...(doc.length === 11 ? { cpf_destinatario: doc } : {}),
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : {}),
    itens: sale.items.map((i, idx) => ({
      numero_item: idx + 1,
      codigo_produto: i.sku || i.product_id,
      descricao: i.name,
      codigo_ncm: (i.ncm || cfg.ncm_padrao).replace(/\D/g, ''),
      cfop: i.cfop || cfg.cfop,
      unidade_comercial: i.unit || cfg.unidade,
      quantidade_comercial: i.quantity,
      valor_unitario_comercial: Number(i.price.toFixed(2)),
      valor_bruto: Number(i.subtotal.toFixed(2)),
      unidade_tributavel: i.unit || cfg.unidade,
      quantidade_tributavel: i.quantity,
      valor_unitario_tributavel: Number(i.price.toFixed(2)),
      icms_origem: i.origin || '0',
      icms_situacao_tributaria: cfg.csosn,
    })),
    formas_pagamento: [{
      forma_pagamento: PAYMENT_CODES[sale.payment_method],
      valor_pagamento: Number(sale.subtotal.toFixed(2)),
    }],
  };
}

interface FocusResponse {
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  mensagem?: string;
  codigo?: string;
  chave_nfe?: string;
  numero?: string | number;
  serie?: string | number;
  protocolo?: string;
  qrcode_url?: string;
  caminho_danfe?: string;
  url_danfe?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_xml_cancelamento?: string;
  erros?: { mensagem?: string }[];
}

const STATUS_MAP: Record<string, string> = {
  autorizado: 'autorizada',
  processando_autorizacao: 'processando',
  erro_autorizacao: 'rejeitada',
  cancelado: 'cancelada',
  erro_cancelamento: 'autorizada',
};

function toFiscal(res: FocusResponse, cfg: FiscalSettings): ReceiptFiscal {
  const status = STATUS_MAP[res.status || ''] || res.status || 'erro';
  const detalhe = res.mensagem_sefaz || res.mensagem || res.erros?.map(e => e.mensagem).filter(Boolean).join('; ');
  return {
    status,
    numero: res.numero,
    serie: res.serie,
    chave: res.chave_nfe,
    protocolo: res.protocolo,
    qrcode_url: res.qrcode_url,
    danfe_url: res.caminho_danfe || res.url_danfe,
    xml_url: res.caminho_xml_nota_fiscal,
    xml_cancelamento_url: res.caminho_xml_cancelamento,
    ambiente: cfg.ambiente,
    emitido_em: new Date().toISOString(),
    ...(detalhe ? { mensagem: detalhe } : {}),
  };
}

/** Traduz recusas do governo para o que a pessoa precisa fazer, sem jargão. */
export function explainFiscalError(raw?: string): string {
  const m = (raw || '').toLowerCase();
  if (/ncm/.test(m)) return 'O código NCM de algum produto está errado ou não existe. Corrija em Estoque → "Preencher NCM por planilha" e tente de novo.';
  if (/csc|token.*nfce|id do token/.test(m)) return 'O código de segurança da empresa (CSC) está incorreto ou não foi cadastrado no emissor. Peça ajuda ao contador.';
  if (/certificado|assinatura/.test(m)) return 'Há um problema com o certificado digital da empresa (vencido ou senha errada). Fale com o contador ou com o suporte do emissor.';
  if (/cpf|cnpj.*destinat/.test(m)) return 'O CPF/CNPJ do cliente está inválido. Corrija o número ou emita sem CPF.';
  if (/duplicidade|duplicada|ja existe|já existe/.test(m)) return 'Esta nota já foi emitida antes. Use "Consultar" para ver o resultado.';
  if (/inscri[cç][aã]o estadual|\bie\b/.test(m)) return 'A Inscrição Estadual da empresa não confere. Confira com o contador.';
  if (/cfop|csosn|cst|icms|tribut/.test(m)) return 'Há um erro de tributação (CFOP/CSOSN) nos dados fiscais. Peça ao contador para conferir em Configurações → Nota Fiscal.';
  if (/rejei[cç][aã]o|rejeitad/.test(m)) return 'O governo recusou a nota. Veja o detalhe abaixo e, se não entender, mostre ao contador.';
  return 'Não foi possível emitir a nota agora. Tente de novo em instantes; se continuar, mostre o detalhe abaixo ao contador.';
}

async function callFiscalApi(cfg: FiscalSettings, path: string, init: RequestInit): Promise<FocusResponse> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Você ficou muito tempo parado. Saia e entre de novo no sistema para emitir a nota.');
  const res = await fetch(`${cfg.endpoint.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const body = (await res.json().catch(() => ({}))) as FocusResponse;
  // 4xx da SEFAZ/Focus (ex.: rejeição) vêm com corpo explicativo — devolvemos para tratar como "rejeitada".
  if (!res.ok && !body.status && !body.mensagem && !body.erros) {
    throw new Error(`O emissor de notas não respondeu direito (erro ${res.status}). Confira o endereço em Configurações → Nota Fiscal.`);
  }
  return body;
}

export async function emitNfce(sale: Sale, cfg: FiscalSettings): Promise<ReceiptFiscal> {
  const problems = validateSaleForNfce(sale, cfg);
  if (problems.length) throw new Error(problems.join('\n'));

  // `ref` é a chave de idempotência na Focus: reenviar a mesma venda não gera outra nota.
  const ref = `venda-${sale.id}`;
  const body = await callFiscalApi(cfg, '/nfce', {
    method: 'POST',
    body: JSON.stringify({ ref, ambiente: cfg.ambiente, payload: buildNfcePayload(sale, cfg) }),
  });
  const fiscal = toFiscal(body, cfg);
  await updateSaleFiscal(sale.id, fiscal);
  return fiscal;
}

/** Cancela uma nota já autorizada (a SEFAZ só aceita nos primeiros minutos). */
export async function cancelNfce(sale: Sale, cfg: FiscalSettings, justificativa: string): Promise<ReceiptFiscal> {
  if (justificativa.trim().length < 15) throw new Error('Explique o motivo com pelo menos 15 letras.');
  const body = await callFiscalApi(cfg, `/nfce/venda-${sale.id}`, {
    method: 'DELETE',
    body: JSON.stringify({ ambiente: cfg.ambiente, justificativa: justificativa.trim() }),
  });
  const cancelled = body.status === 'cancelado' || /cancel/i.test(body.status || '');
  if (!cancelled) {
    throw new Error(body.mensagem_sefaz || body.mensagem || 'O governo não aceitou o cancelamento (o prazo pode ter acabado).');
  }
  const fiscal: ReceiptFiscal = { ...(sale.fiscal as ReceiptFiscal), status: 'cancelada', mensagem: undefined };
  await updateSaleFiscal(sale.id, fiscal);
  return fiscal;
}

/** Dentro do prazo para cancelar? (O governo tem a última palavra; isto evita tentativas inúteis.) */
export function cancelWindow(sale: Sale, cfg: FiscalSettings, now: number = Date.now()): { allowed: boolean; minutesLeft: number } {
  const emitted = sale.fiscal?.emitido_em ? new Date(sale.fiscal.emitido_em).getTime() : NaN;
  if (Number.isNaN(emitted)) return { allowed: true, minutesLeft: Infinity };
  const left = emitted + (cfg.cancel_horas || 24) * 3600000 - now;
  return { allowed: left > 0, minutesLeft: Math.floor(left / 60000) };
}

/** Verifica se a URL do emissor responde e se o usuário logado tem permissão. */
export async function pingFiscal(cfg: FiscalSettings): Promise<void> {
  if (!cfg.endpoint.trim()) throw new Error('Cole primeiro o endereço do emissor.');
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Entre no sistema novamente.');
  let res: Response;
  try {
    res = await fetch(`${cfg.endpoint.replace(/\/$/, '')}/ping`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Não consegui falar com esse endereço. Confira se ele está certo e se o emissor foi publicado.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('O emissor recusou o seu acesso. Confira o endereço do site em "ALLOWED_ORIGINS" e se o seu usuário é da equipe.');
  if (!res.ok) throw new Error(`O emissor respondeu com erro (${res.status}).`);
}

/** Consulta o status de uma nota que ficou "processando". */
export async function consultNfce(sale: Sale, cfg: FiscalSettings): Promise<ReceiptFiscal> {
  const body = await callFiscalApi(cfg, `/nfce/venda-${sale.id}?ambiente=${cfg.ambiente}`, { method: 'GET' });
  const fiscal = toFiscal(body, cfg);
  await updateSaleFiscal(sale.id, fiscal);
  return fiscal;
}

// ---- Certificado digital: aviso de vencimento ----
export interface CertStatus {
  level: 'ok' | 'soon' | 'expired';
  days: number;
}

export function certStatus(cfg: FiscalSettings, today: Date = new Date()): CertStatus | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cfg.cert_validade || '')) return null;
  const [y, m, d] = cfg.cert_validade.split('-').map(Number);
  const end = new Date(y, m - 1, d).getTime();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.round((end - start) / 86400000);
  return { days, level: days < 0 ? 'expired' : days <= 30 ? 'soon' : 'ok' };
}

// ---- XMLs para o contador ----
async function fetchFiscalFile(cfg: FiscalSettings, caminho: string): Promise<string> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  const url = `${cfg.endpoint.replace(/\/$/, '')}/arquivo?ambiente=${cfg.ambiente}&caminho=${encodeURIComponent(caminho)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Arquivo indisponível (${res.status}).`);
  return res.text();
}

/** Baixa o XML da nota (e o do cancelamento, se houver). Notas antigas sem o endereço guardado são consultadas de novo. */
export async function getNfceXmls(sale: Sale, cfg: FiscalSettings): Promise<{ xml?: string; xmlCancelamento?: string }> {
  let xmlPath = sale.fiscal?.xml_url;
  let cancelPath = sale.fiscal?.xml_cancelamento_url;
  const needsCancel = sale.fiscal?.status === 'cancelada' && !cancelPath;
  if (!xmlPath || needsCancel) {
    const body = await callFiscalApi(cfg, `/nfce/venda-${sale.id}?ambiente=${cfg.ambiente}`, { method: 'GET' });
    xmlPath = xmlPath || body.caminho_xml_nota_fiscal;
    cancelPath = cancelPath || body.caminho_xml_cancelamento;
  }
  if (!xmlPath) throw new Error('A nota não tem XML disponível.');
  const xml = await fetchFiscalFile(cfg, xmlPath);
  const xmlCancelamento = sale.fiscal?.status === 'cancelada' && cancelPath ? await fetchFiscalFile(cfg, cancelPath) : undefined;
  return { xml, xmlCancelamento };
}
