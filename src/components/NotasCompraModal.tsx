import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Search, Upload } from 'lucide-react';
import { downloadPurchaseXml, listPurchases, openPurchasePdf, uploadPurchasePdf } from '../utils/comprasService';
import type { PurchaseSummary } from '../utils/comprasService';
import { brl } from '../utils/deliveryPayment';

interface Props {
  styles: any;
  onClose: () => void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Histórico das notas de compra lançadas: achar a nota, baixar o XML e ver ou anexar o PDF (DANFE). */
export const NotasCompraModal: React.FC<Props> = ({ styles, onClose }) => {
  const [list, setList] = useState<PurchaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setList(await listPurchases());
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar as notas.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return list;
    return list.filter(p => norm(`${p.supplier_name} ${p.number} ${p.access_key} ${p.supplier_cnpj} ${p.items.map(i => i.name).join(' ')}`).includes(t));
  }, [list, q]);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try { await fn(); } catch (e: any) { setError(e.message || 'Algo deu errado.'); } finally { setBusy(null); }
  };

  const btn: React.CSSProperties = { ...styles.btnAcc(false), padding: '4px 10px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px' };

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-labelledby="notas-title">
        <div style={styles.modalHeader}>
          <h2 id="notas-title" style={{ ...styles.modalTitle, fontSize: '1.2rem' }}>Notas fiscais de compra</h2>
          <button onClick={onClose} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
        </div>

        <div style={{ position: 'relative' }}>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por fornecedor, número da nota, chave ou produto..." style={{ ...styles.formInput, width: '100%', paddingLeft: '34px' }} />
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
        </div>

        {error && <div role="alert" style={{ color: 'hsl(0,75%,45%)', fontSize: '0.85rem' }}>{error}</div>}
        {loading ? (
          <p style={{ color: styles.sidebarWidgetText?.color }}>Carregando...</p>
        ) : shown.length === 0 ? (
          <p style={{ color: styles.sidebarWidgetText?.color, textAlign: 'center', padding: '24px 0' }}>
            {list.length === 0 ? 'Nenhuma nota de compra lançada ainda.' : 'Nenhuma nota encontrada para essa busca.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: `1px solid ${styles.borderColor}`, borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: '760px' }}>
              <thead>
                <tr style={{ backgroundColor: styles.background }}>
                  {['Emissão', 'Fornecedor', 'Nota', 'Itens', 'Total', 'Arquivos'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(p => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${styles.borderColor}`, verticalAlign: 'top' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: styles.textMain }}>{p.issued_at ? new Date(p.issued_at).toLocaleDateString('pt-BR') : '—'}</td>
                    <td style={{ padding: '8px 10px', color: styles.textMain }}>
                      <strong>{p.supplier_name || '—'}</strong>
                      <div style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color }}>lançada em {new Date(p.created_at).toLocaleDateString('pt-BR')}</div>
                    </td>
                    <td style={{ padding: '8px 10px', color: styles.textMain, whiteSpace: 'nowrap' }}>{p.number}{p.series ? `/${p.series}` : ''}</td>
                    <td style={{ padding: '8px 10px', color: styles.textMain }}>{p.items.filter(i => i.result !== 'skip').length}</td>
                    <td style={{ padding: '8px 10px', color: styles.textMain, whiteSpace: 'nowrap', fontWeight: 600 }}>{brl(p.total)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button type="button" disabled={busy === p.id} onClick={() => run(p.id, () => downloadPurchaseXml(p))} style={btn}><Download size={13} /> XML</button>
                        {p.has_pdf ? (
                          <button type="button" disabled={busy === p.id} onClick={() => run(p.id, () => openPurchasePdf(p.id))} style={btn}><FileText size={13} /> Ver PDF</button>
                        ) : (
                          <label style={{ ...btn, cursor: 'pointer' }} title="Guardar o PDF (DANFE) desta nota">
                            <Upload size={13} /> Anexar PDF
                            <input
                              type="file"
                              accept=".pdf"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f) void run(p.id, async () => { await uploadPurchasePdf(p.id, f); await load(); });
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...styles.btnAcc(false), padding: '10px 18px' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
};
