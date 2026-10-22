import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSales } from '../utils/salesService';
import type { Sale } from '../utils/salesService';
import {
  cancelWindow, companyFromSettings, consultNfce, DEFAULT_FISCAL_SETTINGS, emitNfce, explainFiscalError, getFiscalSettings,
} from '../utils/fiscal';
import type { FiscalSettings } from '../utils/fiscal';
import { DEFAULT_COMPANY, printSaleReceipt } from '../utils/printer';
import { buildMonthlyPackage, buildTotalSheet, downloadBlob, monthTotal } from '../utils/accountingExport';
import { CancelDialog } from './CancelDialog';
import { describeItem } from '../utils/units';
import { CertAlert } from './CertAlert';

interface NotasFiscaisProps {
  styles: any;
  /** 'accounting' = visão do contador: consulta e baixa arquivos, sem emitir, cancelar ou imprimir. */
  mode?: 'full' | 'accounting';
}

type Filter = 'todas' | 'sem_nota' | 'problema' | 'emitidas' | 'canceladas';

const brl = (n: number) => `R$ ${(n || 0).toFixed(2).replace('.', ',')}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Tudo o que a pessoa precisa saber sobre a nota de cada venda, num lugar só. */
function noteState(sale: Sale): { key: Filter; label: string; color: string } {
  const st = sale.fiscal?.status;
  if (sale.voided) return { key: 'canceladas', label: st === 'cancelada' ? 'Venda e nota canceladas' : 'Venda cancelada', color: 'hsl(215,15%,45%)' };
  if (!st) return { key: 'sem_nota', label: 'Sem nota', color: 'hsl(215,15%,45%)' };
  if (st === 'autorizada') return { key: 'emitidas', label: `Nota emitida nº ${sale.fiscal?.numero ?? ''}`.trim(), color: 'hsl(142,60%,35%)' };
  if (st === 'cancelada') return { key: 'canceladas', label: 'Nota cancelada', color: 'hsl(215,15%,45%)' };
  if (st === 'processando') return { key: 'problema', label: 'Aguardando confirmação', color: 'hsl(36,95%,38%)' };
  return { key: 'problema', label: 'Nota recusada', color: 'hsl(0,75%,45%)' };
}

export const NotasFiscais: React.FC<NotasFiscaisProps> = ({ styles, mode = 'full' }) => {
  const readOnly = mode === 'accounting';
  const [sales, setSales] = useState<Sale[]>([]);
  const [cfg, setCfg] = useState<FiscalSettings>(DEFAULT_FISCAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [filter, setFilter] = useState<Filter>('todas');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [cancelSale, setCancelSale] = useState<Sale | null>(null);
  // O contador baixa sempre o mês anterior; os demais começam no mês atual.
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    if (mode === 'accounting') d.setMonth(d.getMonth() - 1);
    return dayKey(d).slice(0, 7);
  });
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, settings] = await Promise.all([fetchSales(), getFiscalSettings()]);
      setSales(all);
      setCfg(settings);
    } catch (e) {
      setNotice({ ok: false, text: `Não consegui carregar as vendas: ${e instanceof Error ? e.message : e}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const replaceSale = (updated: Sale) => setSales(prev => prev.map(s => (s.id === updated.id ? updated : s)));

  const daySales = useMemo(
    () => sales.filter(s => dayKey(new Date(s.timestamp)) === day).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [sales, day]
  );
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { todas: daySales.length, sem_nota: 0, problema: 0, emitidas: 0, canceladas: 0 };
    daySales.forEach(s => { c[noteState(s).key]++; });
    return c;
  }, [daySales]);
  const shown = filter === 'todas' ? daySales : daySales.filter(s => noteState(s).key === filter);
  const dayTotal = daySales.filter(s => !s.voided).reduce((a, s) => a + s.subtotal, 0);
  const monthSummary = useMemo(() => {
    const inMonth = sales.filter(s => dayKey(new Date(s.timestamp)).slice(0, 7) === month);
    const sum = (list: Sale[]) => list.reduce((a, s) => a + s.subtotal, 0);
    const active = inMonth.filter(s => !s.voided);
    const emitted = inMonth.filter(s => s.fiscal?.status === 'autorizada');
    const cancelled = inMonth.filter(s => s.fiscal?.status === 'cancelada');
    const noNote = active.filter(s => s.fiscal?.status !== 'autorizada' && s.fiscal?.status !== 'cancelada');
    return { sales: active.length, total: monthTotal(sales, month).total, emitted: emitted.length, emittedValue: sum(emitted), cancelled: cancelled.length, noNote: noNote.length, noNoteValue: sum(noNote) };
  }, [sales, month]);
  const pending = daySales.filter(s => !s.voided && ['sem_nota', 'problema'].includes(noteState(s).key) && s.fiscal?.status !== 'processando');

  const company = cfg.cnpj ? companyFromSettings(cfg) : DEFAULT_COMPANY;

  const emit = async (sale: Sale): Promise<boolean> => {
    try {
      const fiscal = sale.fiscal?.status === 'processando' ? await consultNfce(sale, cfg) : await emitNfce(sale, cfg);
      replaceSale({ ...sale, fiscal });
      return fiscal.status === 'autorizada';
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Falha ao emitir.';
      replaceSale({ ...sale, fiscal: { ...(sale.fiscal || {}), status: 'rejeitada', mensagem: text } });
      return false;
    }
  };

  const emitOne = async (sale: Sale) => {
    setBusyId(sale.id);
    setNotice(null);
    const ok = await emit(sale);
    setNotice(ok ? { ok: true, text: `Venda #${sale.number}: nota emitida.` } : { ok: false, text: `Venda #${sale.number}: a nota não foi emitida. Veja o motivo no cartão da venda.` });
    setBusyId(null);
  };

  const emitAll = async () => {
    setNotice(null);
    setBatch({ done: 0, total: pending.length });
    let okCount = 0;
    for (let i = 0; i < pending.length; i++) {
      if (await emit(pending[i])) okCount++;
      setBatch({ done: i + 1, total: pending.length });
    }
    setBatch(null);
    setNotice({ ok: okCount === pending.length, text: `${okCount} de ${pending.length} notas emitidas.${okCount < pending.length ? ' As que falharam mostram o motivo.' : ''}` });
  };

  const reprint = async (sale: Sale) => {
    setBusyId(sale.id);
    try {
      await printSaleReceipt(sale, company);
      setNotice({ ok: true, text: 'Enviado para a impressora.' });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Falha ao imprimir.' });
    } finally {
      setBusyId(null);
    }
  };

  const exportMonth = async (what: 'zip' | 'csv' | 'total') => {
    setNotice(null);
    setExporting({ done: 0, total: 0 });
    try {
      const result = what === 'total'
        ? buildTotalSheet(sales, month)
        : await buildMonthlyPackage(sales, cfg, month, what === 'zip', (done, total) => setExporting({ done, total }));
      if (result.count === 0) {
        setNotice({ ok: false, text: what === 'total' ? 'Não há vendas neste mês.' : 'Não há notas emitidas neste mês.' });
      } else {
        downloadBlob(result.blob, result.fileName);
        setNotice({
          ok: result.failed.length === 0,
          text: result.failed.length === 0
            ? `Pronto! ${result.count} nota(s) no arquivo ${result.fileName}.`
            : `Baixei ${result.count - result.failed.length} de ${result.count} notas. Não consegui estas: ${result.failed.slice(0, 5).join(', ')}${result.failed.length > 5 ? '…' : ''}. Tente de novo mais tarde.`,
        });
      }
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Não consegui montar o arquivo.' });
    } finally {
      setExporting(null);
    }
  };

  const chip = (f: Filter, label: string): React.ReactNode => (
    <button
      key={f}
      type="button"
      onClick={() => setFilter(f)}
      style={{
        padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
        border: `1px solid ${filter === f ? styles.primary : styles.borderColor}`,
        background: filter === f ? styles.primary : 'none', color: filter === f ? '#fff' : styles.textMain,
      }}
    >
      {label} ({counts[f]})
    </button>
  );

  const smallBtn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`,
    background: 'none', color: styles.textMain, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
  };

  return (
    <div style={{ marginTop: '20px' }}>
      {!readOnly && <CertAlert cfg={cfg} />}
      {!readOnly && !cfg.enabled && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.82rem', background: 'hsl(36,95%,45%,0.08)', border: '1px solid hsl(36,95%,45%,0.25)', color: 'hsl(36,95%,28%)' }}>
          A emissão de notas ainda não foi ligada. Quem é dono do sistema liga em <strong>Configurações → Nota Fiscal</strong>. Enquanto isso, os cupons continuam saindo normalmente.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
        <input
          type="date"
          value={day}
          max={dayKey(new Date())}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          aria-label="Dia"
          style={{ ...styles.formInput, width: 'auto' }}
        />
        <button type="button" style={smallBtn} onClick={() => setDay(dayKey(new Date()))}>Hoje</button>
        <button type="button" style={smallBtn} onClick={() => setDay(dayKey(new Date(Date.now() - 86400000)))}>Ontem</button>
        <button type="button" style={smallBtn} onClick={load}>↻ Atualizar</button>
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: styles.textMain }}>
          <strong>{daySales.length}</strong> venda(s) · <strong>{brl(dayTotal)}</strong>
        </span>
      </div>

      {readOnly && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {[
            { label: 'Notas emitidas no mês', value: String(monthSummary.emitted), sub: brl(monthSummary.emittedValue), color: 'hsl(142,60%,35%)' },
            { label: 'Notas canceladas', value: String(monthSummary.cancelled), sub: '', color: 'hsl(215,15%,45%)' },
            { label: 'Vendas sem nota', value: String(monthSummary.noNote), sub: brl(monthSummary.noNoteValue), color: monthSummary.noNote > 0 ? 'hsl(36,95%,38%)' : 'hsl(215,15%,45%)' },
            { label: 'Total vendido no mês', value: brl(monthSummary.total), sub: `${monthSummary.sales} venda(s)`, color: styles.primary },
          ].map(card => (
            <div key={card.label} style={{ padding: '12px 14px', borderRadius: '10px', border: `1px solid ${styles.borderColor}`, backgroundColor: styles.cardBackground || '#fff' }}>
              <div style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>{card.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: card.color }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 14px', borderRadius: '10px', border: `1px solid ${styles.borderColor}`, marginBottom: '16px' }}>
        <strong style={{ color: styles.textMain }}>{readOnly ? 'Baixar as notas do mês' : 'Enviar para o contador'}</strong>
        <div style={{ fontSize: '0.78rem', margin: '4px 0 10px', color: styles.sidebarWidgetText?.color }}>
          {readOnly ? 'Escolha o mês: a planilha traz só o total vendido; o ZIP traz os XMLs de todas as notas.' : 'Escolha o mês e baixe a planilha com o total vendido e os XMLs das notas para mandar ao contador. O contador também pode baixar sozinho, entrando em Contabilidade.'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <input type="month" value={month} max={dayKey(new Date()).slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Mês" style={{ ...styles.formInput, width: 'auto' }} />
          <button type="button" className="btn-save" disabled={!!exporting} onClick={() => exportMonth('total')} style={{ ...smallBtn, border: 'none' }}>
            ⬇ Planilha do mês (total das vendas)
          </button>
          <button type="button" disabled={!!exporting || !cfg.endpoint} onClick={() => exportMonth('zip')} style={smallBtn}>
            {exporting ? (exporting.total ? `Baixando... ${exporting.done} de ${exporting.total}` : 'Preparando...') : '⬇ XMLs das notas (arquivo ZIP)'}
          </button>
          <button type="button" disabled={!!exporting} onClick={() => exportMonth('csv')} style={smallBtn}>
            ⬇ Resumo nota a nota (planilha)
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        {chip('todas', 'Todas')}
        {chip('sem_nota', 'Sem nota')}
        {chip('problema', 'Com problema')}
        {chip('emitidas', 'Notas emitidas')}
        {chip('canceladas', 'Canceladas')}
      </div>

      {!readOnly && cfg.enabled && pending.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <button
            type="button"
            className="btn-save"
            disabled={!!batch || !!busyId}
            onClick={emitAll}
            style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', fontWeight: 700 }}
          >
            {batch ? `Emitindo... ${batch.done} de ${batch.total}` : `Emitir as ${pending.length} notas pendentes deste dia`}
          </button>
        </div>
      )}

      {notice && (
        <div role="status" style={{
          marginBottom: '14px', padding: '9px 12px', borderRadius: '8px', fontSize: '0.83rem',
          color: notice.ok ? 'hsl(142,60%,30%)' : 'hsl(0,75%,45%)',
          background: notice.ok ? 'hsl(142,60%,45%,0.1)' : 'hsl(0,75%,55%,0.08)',
        }}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', padding: '30px' }}>Carregando vendas...</p>
      ) : shown.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '30px', color: styles.sidebarWidgetText?.color }}>
          Nenhuma venda aqui. {filter !== 'todas' ? 'Troque o filtro acima para ver as outras.' : 'Escolha outro dia.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {shown.map(sale => {
            const st = noteState(sale);
            const busy = busyId === sale.id || !!batch;
            const isProblem = st.key === 'problema';
            return (
              <div key={sale.id} style={{
                padding: '12px 14px', borderRadius: '10px', backgroundColor: styles.cardBackground || '#fff',
                border: `1px solid ${styles.borderColor}`, borderLeft: `4px solid ${st.color}`,
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'baseline' }}>
                  <strong style={{ color: styles.textMain }}>
                    {new Date(sale.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · Venda #{sale.number}
                  </strong>
                  <span style={{ color: styles.textMain }}>{brl(sale.subtotal)} · {sale.payment_method}</span>
                  <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                    {sale.client?.name || 'Cliente sem nome'}{sale.client?.cpf_cnpj ? ' · com CPF/CNPJ' : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '0.82rem', color: st.color }}>{st.label}</span>
                </div>
                <div style={{ fontSize: '0.78rem', marginTop: '4px', color: styles.sidebarWidgetText?.color }}>
                  {sale.items.map(i => describeItem(i.quantity, i.unit, i.name)).join(', ')}
                </div>

                {isProblem && (
                  <div style={{ marginTop: '8px', fontSize: '0.8rem', color: st.color }}>
                    {sale.fiscal?.status === 'processando'
                      ? 'O governo ainda está confirmando esta nota. Clique em "Verificar" em alguns instantes.'
                      : explainFiscalError(sale.fiscal?.mensagem)}
                    {sale.fiscal?.mensagem && sale.fiscal.status !== 'processando' && (
                      <details style={{ marginTop: '4px' }}>
                        <summary style={{ cursor: 'pointer' }}>Ver detalhe (para mostrar ao contador)</summary>
                        <div style={{ whiteSpace: 'pre-wrap', color: styles.textMain }}>{sale.fiscal.mensagem}</div>
                      </details>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  {!readOnly && cfg.enabled && st.key === 'sem_nota' && (
                    <button type="button" disabled={busy} onClick={() => emitOne(sale)} className="btn-save" style={{ ...smallBtn, border: 'none' }}>
                      {busyId === sale.id ? 'Emitindo...' : 'Emitir nota'}
                    </button>
                  )}
                  {!readOnly && cfg.enabled && isProblem && (
                    <button type="button" disabled={busy} onClick={() => emitOne(sale)} className="btn-save" style={{ ...smallBtn, border: 'none' }}>
                      {busyId === sale.id ? 'Aguarde...' : sale.fiscal?.status === 'processando' ? 'Verificar' : 'Tentar de novo'}
                    </button>
                  )}
                  {!readOnly && st.key !== 'canceladas' && (
                    <button type="button" disabled={busy} onClick={() => reprint(sale)} style={smallBtn}>
                      🖨 {st.key === 'emitidas' ? 'Imprimir a nota' : 'Imprimir cupom'}
                    </button>
                  )}
                  {!readOnly && cfg.enabled && st.key === 'emitidas' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setCancelSale(sale)}
                      title={cancelWindow(sale, cfg).allowed ? 'Cancelar esta nota (erro de digitação, desistência...)' : 'O prazo para cancelar já passou'}
                      style={{ ...smallBtn, color: 'hsl(0,75%,45%)', borderColor: 'hsl(0,75%,55%,0.4)', opacity: cancelWindow(sale, cfg).allowed ? 1 : 0.55 }}
                    >
                      🚫 Cancelar nota
                    </button>
                  )}
                  {!readOnly && !sale.voided && (st.key === 'sem_nota' || isProblem) && (
                    <button type="button" disabled={busy} onClick={() => setCancelSale(sale)} style={{ ...smallBtn, color: 'hsl(0,75%,45%)', borderColor: 'hsl(0,75%,55%,0.4)' }}>
                      🚫 Cancelar venda
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelSale && (
        <CancelDialog
          styles={styles}
          sale={cancelSale}
          cfg={cfg}
          onClose={() => setCancelSale(null)}
          onDone={(updated, message) => {
            replaceSale(updated);
            setCancelSale(null);
            setNotice({ ok: true, text: message });
          }}
        />
      )}
    </div>
  );
};
