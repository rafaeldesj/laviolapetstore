import React, { useRef, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { invalidateProducts } from '../supabaseClient';
import { db } from '../firebaseClient';
import { readSheet } from 'read-excel-file/browser';
import { analyzeNcmRows, analyzeNcmSheet, buildProductsCsv, excelRowsToText } from '../utils/ncmImport';
import type { ImportableProduct, NcmImportReport } from '../utils/ncmImport';

interface NcmImportModalProps {
  styles: any;
  products: ImportableProduct[];
  onClose: () => void;
  onDone: () => void;
}

const step: React.CSSProperties = { display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' };
const bubble: React.CSSProperties = {
  flex: '0 0 28px', height: '28px', borderRadius: '50%', background: 'hsl(210,85%,45%)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem',
};

/** Passo a passo para preencher o código fiscal (NCM) de todos os produtos de uma vez, usando uma planilha. */
export const NcmImportModal: React.FC<NcmImportModalProps> = ({ styles, products, onClose, onDone }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<NcmImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const missing = products.filter(p => (p.ncm || '').replace(/\D/g, '').length !== 8).length;

  const download = () => {
    const blob = new Blob([buildProductsCsv(products)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'produtos-la-viola.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = async (file?: File) => {
    setReport(null);
    setError(null);
    if (!file) return;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        setReport(analyzeNcmRows(excelRowsToText(await readSheet(file)), products));
      } else if (/\.xls$/i.test(file.name)) {
        throw new Error('Este é um Excel antigo (.xls). Abra no Excel e salve como "Pasta de Trabalho do Excel (.xlsx)" ou como CSV.');
      } else {
        setReport(analyzeNcmSheet(await file.text(), products));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui ler a planilha.');
    }
  };

  const apply = async () => {
    if (!report || !db || report.changes.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (let i = 0; i < report.changes.length; i += 400) {
        const batch = writeBatch(db);
        report.changes.slice(i, i + 400).forEach(c =>
          batch.update(doc(db!, 'products', c.product.id), { ncm: c.ncm, origin: c.origin, updated_at: serverTimestamp() })
        );
        await batch.commit();
      }
      invalidateProducts();
      setDone(report.changes.length);
      onDone();
    } catch (e) {
      setError(`Não foi possível salvar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const btn: React.CSSProperties = {
    padding: '9px 16px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`,
    background: 'none', color: styles.textMain, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, maxWidth: '560px' }} role="dialog" aria-modal="true" aria-labelledby="ncm-title">
        <div style={styles.modalHeader}>
          <h2 id="ncm-title" style={styles.modalTitle}>Preencher o código fiscal dos produtos</h2>
          <button onClick={onClose} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
        </div>

        <p style={{ fontSize: '0.85rem', marginBottom: '16px', color: styles.sidebarWidgetText?.color }}>
          Para emitir nota fiscal, cada produto precisa de um <strong>NCM</strong> (um código de 8 números).
          {missing > 0
            ? <> Hoje <strong>{missing} de {products.length}</strong> produtos ainda estão sem ele.</>
            : <> Todos os seus produtos já têm NCM. 🎉</>}
          {' '}Não tem a lista? Peça à empresa que emite as notas hoje para <strong>exportar o cadastro de produtos com o NCM</strong> (Excel) e envie no passo 3.
        </p>

        {done !== null ? (
          <div role="status" style={{ padding: '14px', borderRadius: '8px', background: 'hsl(142,60%,45%,0.1)', color: 'hsl(142,60%,30%)', fontWeight: 600 }}>
            ✓ Pronto! {done} produto{done === 1 ? '' : 's'} atualizado{done === 1 ? '' : 's'}.
            <div style={{ marginTop: '12px' }}>
              <button onClick={onClose} className="btn-save" style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', fontWeight: 700 }}>Fechar</button>
            </div>
          </div>
        ) : (
          <>
            <div style={step}>
              <span style={bubble}>1</span>
              <div>
                <strong>Baixe a planilha com os seus produtos</strong>
                <div style={{ marginTop: '8px' }}>
                  <button type="button" style={btn} onClick={download}>⬇ Baixar planilha dos meus produtos</button>
                </div>
              </div>
            </div>

            <div style={step}>
              <span style={bubble}>2</span>
              <div>
                <strong>Abra no Excel e preencha só a coluna "NCM"</strong>
                <div style={{ fontSize: '0.8rem', marginTop: '4px', color: styles.sidebarWidgetText?.color }}>
                  Não mude as outras colunas. Pode deixar em branco os produtos que ainda não sabe. Depois salve como <strong>CSV</strong>.
                </div>
              </div>
            </div>

            <div style={step}>
              <span style={bubble}>3</span>
              <div>
                <strong>Envie a planilha preenchida (CSV ou Excel .xlsx)</strong>
                <div style={{ marginTop: '8px' }}>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
                </div>
              </div>
            </div>

            {error && (
              <div role="alert" style={{ padding: '10px 12px', borderRadius: '8px', background: 'hsl(0,75%,55%,0.08)', color: 'hsl(0,75%,45%)', fontSize: '0.85rem', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            {report && (
              <div style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`, fontSize: '0.85rem', marginBottom: '14px' }}>
                <div><strong style={{ color: 'hsl(142,60%,35%)' }}>{report.changes.length}</strong> produto(s) serão atualizados</div>
                {report.unchanged > 0 && <div>{report.unchanged} já estavam certos</div>}
                {report.skippedEmpty > 0 && <div>{report.skippedEmpty} sem NCM preenchido (ficam como estão)</div>}
                {report.invalid.length > 0 && (
                  <div style={{ color: 'hsl(0,75%,45%)', marginTop: '6px' }}>
                    ⚠ {report.invalid.length} com NCM errado (precisa ter 8 números) — não serão alterados:
                    <ul style={{ margin: '4px 0 0 18px' }}>
                      {report.invalid.slice(0, 5).map(i => <li key={i.line}>linha {i.line}: {i.name} ({i.value})</li>)}
                      {report.invalid.length > 5 && <li>e mais {report.invalid.length - 5}…</li>}
                    </ul>
                  </div>
                )}
                {report.notFound.length > 0 && (
                  <div style={{ color: 'hsl(36,95%,35%)', marginTop: '6px' }}>
                    ⚠ {report.notFound.length} linha(s) não bateram com nenhum produto — não serão alteradas:
                    <ul style={{ margin: '4px 0 0 18px' }}>
                      {report.notFound.slice(0, 5).map(i => <li key={i.line}>linha {i.line}: {i.name}</li>)}
                      {report.notFound.length > 5 && <li>e mais {report.notFound.length - 5}…</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" style={btn} onClick={onClose}>Cancelar</button>
              <button
                type="button"
                className="btn-save"
                disabled={!report || report.changes.length === 0 || saving}
                onClick={apply}
                style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', fontWeight: 700 }}
              >
                {saving ? 'Salvando...' : 'Confirmar e salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
