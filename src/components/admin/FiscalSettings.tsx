import React, { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { DEFAULT_FISCAL_SETTINGS, getFiscalSettings, isValidCnpj, pingFiscal, saveFiscalSettings } from '../../utils/fiscal';
import type { FiscalSettings } from '../../utils/fiscal';

const field: React.CSSProperties = {
  width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', fontSize: '0.9rem',
  background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.15)', color: 'var(--text-primary, #1e293b)',
};
const label: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary, #64748b)',
};

export const FiscalSettingsPanel: React.FC = () => {
  const [cfg, setCfg] = useState<FiscalSettings>(DEFAULT_FISCAL_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getFiscalSettings().then(s => { setCfg(s); setLoaded(true); });
  }, []);

  const set = <K extends keyof FiscalSettings>(k: K, v: FiscalSettings[K]) => setCfg(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setMsg(null);
    if (cfg.enabled && cfg.regime !== 'simples') {
      setMsg({ ok: false, text: 'Escolha o regime da empresa (pergunte ao contador). Por enquanto só o Simples Nacional é aceito.' });
      return;
    }
    if (cfg.enabled && !isValidCnpj(cfg.cnpj)) {
      setMsg({ ok: false, text: 'Informe um CNPJ válido para ativar a emissão.' });
      return;
    }
    if (cfg.ncm_padrao && cfg.ncm_padrao.replace(/\D/g, '').length !== 8) {
      setMsg({ ok: false, text: 'O NCM padrão deve ter 8 dígitos (ou fique vazio).' });
      return;
    }
    try {
      await saveFiscalSettings(cfg);
      setMsg({ ok: true, text: 'Configurações fiscais salvas.' });
    } catch (e) {
      setMsg({ ok: false, text: `Não foi possível salvar no servidor (${e instanceof Error ? e.message : e}). Salvo apenas neste computador.` });
    }
  };

  const test = async () => {
    setMsg(null);
    setTesting(true);
    try {
      await pingFiscal(cfg);
      setMsg({ ok: true, text: 'Conexão funcionando! O sistema consegue falar com o emissor de notas.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não consegui testar a conexão.' });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return <p>Carregando...</p>;

  const steps = [
    { done: isValidCnpj(cfg.cnpj), text: 'CNPJ da empresa preenchido' },
    { done: cfg.endpoint.trim().startsWith('https://'), text: 'Endereço do emissor de notas colado' },
    { done: cfg.regime === 'simples', text: cfg.regime === 'outro' ? 'Regime da empresa: ainda não suportado pelo sistema' : 'Regime da empresa confirmado com o contador' },
    { done: !!cfg.cert_validade, text: 'Validade do certificado digital anotada (para o aviso de renovação)' },
    { done: cfg.enabled, text: 'Emissão de notas ligada' },
    { done: cfg.ambiente === 'producao', text: cfg.ambiente === 'producao' ? 'Valendo de verdade (modo real)' : 'Ainda em modo de teste (as notas não valem)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--primary-gold)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Receipt size={22} /> Nota Fiscal (NFC-e)
        </h3>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4 }}>
          A emissão usa a Focus NFe por um proxy gratuito (Cloudflare Worker em <code>worker/</code>; o token da Focus fica no servidor). Antes de ativar: cadastre a empresa
          (certificado A1, CSC e série da NFC-e) na Focus NFe e publique o Worker. Comece sempre em <strong>homologação</strong>.
        </p>
      </div>

      <div style={{ padding: '1rem', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.12)' }}>
        <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Como está a sua configuração</strong>
        {steps.map(st => (
          <div key={st.text} style={{ fontSize: '0.85rem', padding: '2px 0', color: st.done ? '#059669' : 'var(--text-secondary, #64748b)' }}>
            {st.done ? '✓' : '○'} {st.text}
          </div>
        ))}
        <p style={{ fontSize: '0.78rem', margin: '0.6rem 0 0', color: 'var(--text-secondary, #64748b)' }}>
          Ordem sugerida: (1) preencha o CNPJ, (2) cole o endereço do emissor, (3) clique em "Testar conexão", (4) ligue a emissão em modo de teste,
          (5) faça algumas vendas de teste, (6) só depois passe para o modo real.
        </p>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 600 }}>
        <input type="checkbox" checked={cfg.enabled} onChange={e => set('enabled', e.target.checked)} />
        Ligar a emissão de notas fiscais no caixa
      </label>

      <div className="responsive-grid-2" style={{ gap: '1rem' }}>
        <div>
          <label style={label}>MODO</label>
          <select style={field} value={cfg.ambiente} onChange={e => set('ambiente', e.target.value as FiscalSettings['ambiente'])}>
            <option value="homologacao">Modo de teste (as notas NÃO valem)</option>
            <option value="producao">Modo real (as notas valem de verdade)</option>
          </select>
        </div>
        <div>
          <label style={label}>ENDEREÇO DO EMISSOR DE NOTAS</label>
          <input style={field} placeholder="https://laviola-fiscal.SUA-CONTA.workers.dev"
            value={cfg.endpoint} onChange={e => set('endpoint', e.target.value)} />
        </div>
        <div>
          <label style={label}>CNPJ DA EMPRESA</label>
          <input style={field} inputMode="numeric" placeholder="00.000.000/0000-00" value={cfg.cnpj} onChange={e => set('cnpj', e.target.value)} />
        </div>
        <div>
          <label style={label}>INSCRIÇÃO ESTADUAL</label>
          <input style={field} value={cfg.ie} onChange={e => set('ie', e.target.value)} />
        </div>
        <div>
          <label style={label}>RAZÃO SOCIAL</label>
          <input style={field} value={cfg.razao_social} onChange={e => set('razao_social', e.target.value)} />
        </div>
        <div>
          <label style={label}>NOME FANTASIA (cabeçalho do cupom)</label>
          <input style={field} value={cfg.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} />
        </div>
        <div>
          <label style={label}>ENDEREÇO (cabeçalho do cupom)</label>
          <input style={field} value={cfg.endereco} onChange={e => set('endereco', e.target.value)} />
        </div>
        <div>
          <label style={label}>TELEFONE (cabeçalho do cupom)</label>
          <input style={field} value={cfg.telefone} onChange={e => set('telefone', e.target.value)} />
        </div>
      </div>

      <div className="responsive-grid-2" style={{ gap: '1rem' }}>
        <div>
          <label style={label}>REGIME DA EMPRESA (pergunte ao contador)</label>
          <select style={field} value={cfg.regime} onChange={e => set('regime', e.target.value as FiscalSettings['regime'])}>
            <option value="">Escolha...</option>
            <option value="simples">Simples Nacional</option>
            <option value="outro">Outro (Lucro Presumido ou Real)</option>
          </select>
        </div>
        <div>
          <label style={label}>VALIDADE DO CERTIFICADO DIGITAL</label>
          <input style={field} type="date" value={cfg.cert_validade} onChange={e => set('cert_validade', e.target.value)} />
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.25rem' }}>Dados de imposto (peça ao contador)</h4>
        <div className="responsive-grid-2" style={{ gap: '1rem' }}>
          <div>
            <label style={label}>CSOSN</label>
            <input style={field} value={cfg.csosn} onChange={e => set('csosn', e.target.value)} />
          </div>
          <div>
            <label style={label}>CFOP</label>
            <input style={field} value={cfg.cfop} onChange={e => set('cfop', e.target.value)} />
          </div>
          <div>
            <label style={label}>UNIDADE</label>
            <input style={field} value={cfg.unidade} onChange={e => set('unidade', e.target.value)} />
          </div>
          <div>
            <label style={label}>PRAZO PARA CANCELAR UMA NOTA (horas; 0,5 = meia hora)</label>
            <input style={field} type="number" min={0.5} step={0.5} max={720} value={cfg.cancel_horas} onChange={e => set('cancel_horas', Math.max(0.5, Number(e.target.value) || 24))} />
          </div>
          <div>
            <label style={label}>NCM PADRÃO (opcional)</label>
            <input style={field} maxLength={8} placeholder="Vazio = exigir NCM em cada produto" value={cfg.ncm_padrao} onChange={e => set('ncm_padrao', e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Confirme CSOSN, CFOP e NCM com o seu contador — o valor correto depende do produto (ração, medicamento etc.) e do regime da empresa.
        </p>
      </div>

      {msg && (
        <div role="status" style={{ padding: '0.7rem 1rem', borderRadius: '8px', fontSize: '0.85rem',
          background: msg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: msg.ok ? '#059669' : '#dc2626' }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={save} className="btn-save" style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: 'none', fontWeight: 700 }}>
          Salvar
        </button>
        <button type="button" onClick={test} disabled={testing} style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.2)', background: 'none', fontWeight: 700, cursor: 'pointer', color: 'var(--text-primary, #1e293b)' }}>
          {testing ? 'Testando...' : 'Testar conexão'}
        </button>
      </div>
    </div>
  );
};
