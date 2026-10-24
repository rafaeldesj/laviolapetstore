import React, { useMemo, useRef, useState } from 'react';
import { FileText, Upload, X, PackagePlus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Product } from '../supabaseClient';
import { invalidateProducts } from '../supabaseClient';
import { parseNfeXml, keyFromFileName } from '../utils/nfeParser';
import type { NfeNote } from '../utils/nfeParser';
import { getSupplierLinks, listPurchases, registerPurchase, uploadPurchasePdf } from '../utils/comprasService';
import type { PurchaseLine } from '../utils/comprasService';
import { searchProducts } from '../utils/productSearch';
import { guessCategory } from '../utils/productCategory';
import { brl } from '../utils/deliveryPayment';

interface Props {
  styles: any;
  products: Product[];
  categories: string[];
  onClose: () => void;
  /** Chamado depois de lançar notas, para a tela atualizar a lista de produtos. */
  onDone: () => void;
}

type Action = 'link' | 'new' | 'skip';

interface Row {
  idx: number;
  supplierCode: string;
  ean: string;
  name: string;
  ncm: string;
  origin: string;
  unit: 'UN' | 'KG' | 'LT';
  noteUnit: string;
  action: Action;
  productId: string;
  qty: string;
  cost: string;
  price: string;
  priceEdited: boolean;
  updateCost: boolean;
  category: string;
  search: string;
  searching: boolean;
}

interface NoteState {
  note: NfeNote;
  xml: string;
  fileName: string;
  pdf: File | null;
  include: boolean;
  duplicateAt: string | null;
  rows: Row[];
}

const toNum = (v: string): number => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const money2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const readText = (f: File) => f.text();

export const EntradaMercadoriaModal: React.FC<Props> = ({ styles, products, categories, onClose, onDone }) => {
  const [notes, setNotes] = useState<NoteState[]>([]);
  const [margin, setMargin] = useState<string>('40');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<{ ok: boolean; text: string }[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const newPrice = (cost: number) => money2(cost * (1 + (toNum(margin) || 0) / 100));

  const buildRows = (note: NfeNote, links: Map<string, string>): Row[] =>
    note.items.map((it, idx) => {
      let productId = links.get(it.supplierCode) || '';
      if (productId && !productById.has(productId)) productId = '';
      if (!productId && it.ean) productId = products.find(p => p.sku === it.ean)?.id || '';
      if (!productId && it.supplierCode) productId = products.find(p => p.sku === it.supplierCode || (p as any).legacy_code === it.supplierCode)?.id || '';
      const matched = productId ? productById.get(productId) : undefined;
      return {
        idx,
        supplierCode: it.supplierCode,
        ean: it.ean,
        name: it.name,
        ncm: it.ncm,
        origin: it.origin,
        unit: it.unit,
        noteUnit: it.noteUnit,
        action: matched ? 'link' : 'new',
        productId: matched?.id || '',
        qty: String(it.qty).replace('.', ','),
        cost: String(it.cost).replace('.', ','),
        price: String(newPrice(it.cost)).replace('.', ','),
        priceEdited: false,
        updateCost: true,
        category: guessCategory(it.name),
        search: '',
        searching: false,
      };
    });

  const handleFiles = async (files: File[]) => {
    setError(null);
    setResults(null);
    const xmls = files.filter(f => /\.xml$/i.test(f.name));
    const pdfs = files.filter(f => /\.pdf$/i.test(f.name));
    if (xmls.length === 0) {
      setError('Anexe o arquivo XML da nota (é ele que dá entrada no estoque). O PDF é opcional.');
      return;
    }
    setLoading(true);
    try {
      const already = new Set(notes.map(n => n.note.accessKey));
      const known = await listPurchases().catch(() => [] as Awaited<ReturnType<typeof listPurchases>>);
      const knownByKey = new Map(known.map(p => [p.access_key, p.created_at]));
      const added: NoteState[] = [];
      const problems: string[] = [];
      for (const f of xmls) {
        try {
          const xml = await readText(f);
          const note = parseNfeXml(xml);
          if (already.has(note.accessKey) || added.some(a => a.note.accessKey === note.accessKey)) continue;
          const links = await getSupplierLinks(note.supplierCnpj).catch(() => new Map<string, string>());
          added.push({
            note, xml, fileName: f.name, pdf: null, include: true,
            duplicateAt: knownByKey.get(note.accessKey) || null,
            rows: buildRows(note, links),
          });
        } catch (e: any) {
          problems.push(`${f.name}: ${e.message || 'não consegui ler'}`);
        }
      }
      // PDF opcional: casa pelo número de 44 dígitos no nome do arquivo; se só há uma nota e um PDF, também.
      const unmatched: File[] = [];
      for (const p of pdfs) {
        const key = keyFromFileName(p.name);
        const target = added.find(a => a.note.accessKey === key);
        if (target) target.pdf = p; else unmatched.push(p);
      }
      if (unmatched.length === 1 && added.length === 1 && !added[0].pdf) added[0].pdf = unmatched[0];
      if (problems.length) setError(problems.join('\n'));
      setNotes(prev => [...prev, ...added]);
    } finally {
      setLoading(false);
    }
  };

  const patchNote = (key: string, patch: Partial<NoteState>) =>
    setNotes(prev => prev.map(n => (n.note.accessKey === key ? { ...n, ...patch } : n)));
  const patchRow = (key: string, idx: number, patch: Partial<Row>) =>
    setNotes(prev => prev.map(n => (n.note.accessKey === key ? { ...n, rows: n.rows.map(r => (r.idx === idx ? { ...r, ...patch } : r)) } : n)));

  const onMarginChange = (v: string) => {
    setMargin(v);
    const m = toNum(v) || 0;
    setNotes(prev => prev.map(n => ({
      ...n,
      rows: n.rows.map(r => (r.action === 'new' && !r.priceEdited ? { ...r, price: String(money2(toNum(r.cost) * (1 + m / 100))).replace('.', ',') } : r)),
    })));
  };

  const active = notes.filter(n => n.include && !n.duplicateAt);

  const apply = async () => {
    setError(null);
    for (const n of active) {
      for (const r of n.rows) {
        if (r.action === 'link' && !r.productId) { setError(`Nota ${n.note.number}: "${r.name}" está marcado para usar um produto, mas nenhum foi escolhido.`); return; }
        if (r.action === 'new' && toNum(r.qty) > 0 && toNum(r.price) <= 0) { setError(`Nota ${n.note.number}: informe o preço de venda de "${r.name}" (produto novo).`); return; }
      }
    }
    setLoading(true);
    const out: { ok: boolean; text: string }[] = [];
    for (const n of active) {
      try {
        const lines: PurchaseLine[] = n.rows.map(r => ({
          action: toNum(r.qty) > 0 ? r.action : 'skip',
          product_id: r.action === 'link' ? r.productId : undefined,
          supplier_code: r.supplierCode,
          name: r.name,
          ean: r.ean,
          ncm: r.ncm,
          origin: r.origin,
          unit: r.unit,
          category: r.category,
          qty: toNum(r.qty),
          cost: toNum(r.cost),
          price: toNum(r.price),
          update_cost: r.updateCost,
        }));
        const res = await registerPurchase(n.note, n.xml, lines);
        if (res.duplicate) {
          out.push({ ok: false, text: `Nota ${n.note.number} (${n.note.supplierName}): já tinha sido lançada antes. Nada foi alterado.` });
          continue;
        }
        let pdfNote = '';
        if (n.pdf && res.purchase_id) {
          try { await uploadPurchasePdf(res.purchase_id, n.pdf); pdfNote = ' PDF guardado.'; }
          catch (e: any) { pdfNote = ` (O PDF não foi guardado: ${e.message}. Dá para anexar depois em "Notas de compra".)`; }
        }
        out.push({ ok: true, text: `Nota ${n.note.number} (${n.note.supplierName}): ${res.created} produto(s) novo(s), ${res.updated} atualizado(s)${res.skipped ? `, ${res.skipped} ignorado(s)` : ''}.${pdfNote}` });
      } catch (e: any) {
        out.push({ ok: false, text: `Nota ${n.note.number} (${n.note.supplierName}): não foi lançada. ${e.message || ''}` });
      }
    }
    invalidateProducts();
    setResults(out);
    setNotes([]);
    setLoading(false);
    onDone();
  };

  const smallInput: React.CSSProperties = { ...styles.formInput, padding: '5px 8px', fontSize: '0.8rem', width: '100%', minWidth: 0 };
  const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color, whiteSpace: 'nowrap' };

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, maxWidth: '1100px', maxHeight: '92vh', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-labelledby="entrada-title">
        <div style={styles.modalHeader}>
          <h2 id="entrada-title" style={{ ...styles.modalTitle, fontSize: '1.2rem' }}>
            <PackagePlus size={20} style={{ verticalAlign: 'middle', marginRight: '8px', color: styles.primary }} />
            Entrada de mercadoria (nota fiscal de compra)
          </h2>
          <button onClick={onClose} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
        </div>

        {results ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', fontSize: '0.88rem', color: styles.textMain, border: `1px solid ${r.ok ? 'hsl(142,60%,40%,0.4)' : 'hsl(0,75%,55%,0.4)'}`, backgroundColor: r.ok ? 'hsl(142,60%,45%,0.08)' : 'hsl(0,75%,55%,0.08)' }}>
                {r.ok ? <CheckCircle2 size={18} style={{ color: 'hsl(142,60%,35%)', flexShrink: 0 }} /> : <AlertTriangle size={18} style={{ color: 'hsl(0,75%,50%)', flexShrink: 0 }} />}
                <span>{r.text}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => setResults(null)} style={{ ...styles.btnAcc(false), padding: '10px 16px' }}>Lançar outra nota</button>
              <button type="button" onClick={onClose} className="btn-save" style={{ ...styles.formSubmitBtn(false), margin: 0, width: 'auto', padding: '10px 22px' }}>Fechar</button>
            </div>
          </div>
        ) : (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(Array.from(e.dataTransfer.files)); }}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? styles.primary : styles.borderColor}`, borderRadius: '12px', padding: notes.length ? '12px' : '28px 16px', textAlign: 'center', cursor: 'pointer',
                backgroundColor: dragging ? `${styles.primary}12` : styles.background,
              }}
            >
              <Upload size={notes.length ? 20 : 34} style={{ color: styles.primary, display: 'block', margin: '0 auto 8px' }} />
              <span style={{ fontWeight: 600, color: styles.textMain, display: 'block' }}>
                Arraste aqui o <strong>XML</strong> da nota (e o <strong>PDF</strong>, se quiser guardar) ou clique para escolher
              </span>
              <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                O XML é o que dá entrada no estoque. O PDF (DANFE) é opcional: fica guardado para você achar a nota depois. Pode anexar várias notas de uma vez.
              </span>
              <input ref={inputRef} type="file" multiple accept=".xml,.pdf" style={{ display: 'none' }} onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; void handleFiles(f); }} />
            </div>

            {error && <div role="alert" style={{ whiteSpace: 'pre-line', color: 'hsl(0,75%,45%)', fontSize: '0.85rem', padding: '8px 12px', borderRadius: '8px', backgroundColor: 'hsl(0,75%,55%,0.08)', border: '1px solid hsl(0,75%,55%,0.25)' }}>{error}</div>}
            {loading && <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.85rem', margin: 0 }}>Processando...</p>}

            {notes.length > 0 && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: styles.textMain }}>
                  Margem sugerida para produtos novos:
                  <input type="text" inputMode="decimal" value={margin} onChange={(e) => onMarginChange(e.target.value)} style={{ ...smallInput, width: '70px' }} aria-label="Margem em porcentagem" /> %
                  <span style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.78rem' }}>(o preço de venda de cada produto novo pode ser ajustado na linha)</span>
                </label>

                {notes.map(n => {
                  const key = n.note.accessKey;
                  const open = expanded[key] !== false;
                  const totalCost = n.rows.reduce((a, r) => a + (r.action === 'skip' ? 0 : toNum(r.qty) * toNum(r.cost)), 0);
                  const newCount = n.rows.filter(r => r.action === 'new' && toNum(r.qty) > 0).length;
                  const linkCount = n.rows.filter(r => r.action === 'link' && toNum(r.qty) > 0).length;
                  return (
                    <div key={key} style={{ border: `1px solid ${styles.borderColor}`, borderRadius: '12px', overflow: 'hidden', opacity: n.include && !n.duplicateAt ? 1 : 0.6 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: styles.background }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: styles.textMain, fontSize: '0.92rem' }}>{n.note.supplierName || 'Fornecedor'}</div>
                          <div style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>
                            Nota nº {n.note.number}{n.note.series ? `/${n.note.series}` : ''} · {n.note.issuedAt ? new Date(n.note.issuedAt).toLocaleDateString('pt-BR') : 'sem data'} · total {brl(n.note.total)} · {n.note.items.length} itens
                          </div>
                          {n.duplicateAt && (
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'hsl(0,75%,45%)', marginTop: '2px' }}>
                              ⚠ Esta nota já foi lançada em {new Date(n.duplicateAt).toLocaleDateString('pt-BR')}. Ela não será lançada de novo.
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>{newCount} novo(s) · {linkCount} no estoque · custo {brl(totalCost)}</span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: styles.textMain, cursor: 'pointer' }} title="PDF (DANFE) da nota: opcional">
                            <FileText size={15} style={{ color: styles.primary }} />
                            {n.pdf ? (
                              <>
                                <span style={{ maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.pdf.name}</span>
                                <button type="button" onClick={(e) => { e.preventDefault(); patchNote(key, { pdf: null }); }} aria-label="Tirar o PDF" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(0,75%,50%)', display: 'flex' }}><X size={14} /></button>
                              </>
                            ) : (
                              <span style={{ textDecoration: 'underline', color: styles.primary }}>Anexar PDF (opcional)</span>
                            )}
                            <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) patchNote(key, { pdf: f }); }} />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: styles.textMain, cursor: 'pointer' }}>
                            <input type="checkbox" checked={n.include && !n.duplicateAt} disabled={!!n.duplicateAt} onChange={(e) => patchNote(key, { include: e.target.checked })} /> Lançar
                          </label>
                          <button type="button" onClick={() => setExpanded(p => ({ ...p, [key]: !open }))} style={{ ...styles.btnAcc(false), padding: '4px 10px', fontSize: '0.78rem' }}>{open ? 'Recolher' : 'Ver itens'}</button>
                          <button type="button" onClick={() => setNotes(prev => prev.filter(x => x.note.accessKey !== key))} aria-label="Tirar esta nota da lista" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(0,75%,50%)', display: 'flex' }}><X size={18} /></button>
                        </div>
                      </div>

                      {open && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: '860px' }}>
                            <thead>
                              <tr style={{ borderTop: `1px solid ${styles.borderColor}`, borderBottom: `1px solid ${styles.borderColor}` }}>
                                <th style={th}>Produto na nota</th>
                                <th style={{ ...th, width: '86px' }}>Qtd</th>
                                <th style={{ ...th, width: '96px' }}>Custo unit.</th>
                                <th style={{ ...th, width: '96px' }}>Venda</th>
                                <th style={{ ...th, width: '330px' }}>No estoque</th>
                              </tr>
                            </thead>
                            <tbody>
                              {n.rows.map(r => {
                                const prod = r.productId ? productById.get(r.productId) : undefined;
                                const results = r.searching ? searchProducts(products, r.search, 6).items : [];
                                return (
                                  <tr key={r.idx} style={{ borderBottom: `1px solid ${styles.borderColor}`, opacity: r.action === 'skip' ? 0.5 : 1, verticalAlign: 'top' }}>
                                    <td style={{ padding: '8px', minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, color: styles.textMain, overflowWrap: 'anywhere' }}>{r.name}</div>
                                      <div style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color }}>
                                        cód. {r.supplierCode || '—'}{r.ean ? ` · EAN ${r.ean}` : ''}{r.ncm ? ` · NCM ${r.ncm}` : ''} · na nota: {r.noteUnit || 'UN'}
                                      </div>
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <input type="text" inputMode="decimal" value={r.qty} onChange={(e) => patchRow(key, r.idx, { qty: e.target.value })} style={smallInput} aria-label={`Quantidade de ${r.name}`} />
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <input type="text" inputMode="decimal" value={r.cost} onChange={(e) => patchRow(key, r.idx, { cost: e.target.value, ...(r.action === 'new' && !r.priceEdited ? { price: String(newPrice(toNum(e.target.value))).replace('.', ',') } : {}) })} style={smallInput} aria-label={`Custo de ${r.name}`} />
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      {r.action === 'new' ? (
                                        <input type="text" inputMode="decimal" value={r.price} onChange={(e) => patchRow(key, r.idx, { price: e.target.value, priceEdited: true })} style={smallInput} aria-label={`Preço de venda de ${r.name}`} />
                                      ) : prod ? (
                                        <span style={{ color: styles.textMain, fontWeight: 600 }}>{brl(prod.price)}</span>
                                      ) : '—'}
                                    </td>
                                    <td style={{ padding: '6px 8px', position: 'relative' }}>
                                      <select
                                        value={r.action}
                                        onChange={(e) => {
                                          const action = e.target.value as Action;
                                          patchRow(key, r.idx, { action, ...(action === 'link' && !r.productId ? { searching: true } : {}), ...(action === 'new' && !r.priceEdited ? { price: String(newPrice(toNum(r.cost))).replace('.', ',') } : {}) });
                                        }}
                                        style={smallInput}
                                        aria-label={`O que fazer com ${r.name}`}
                                      >
                                        <option value="link">Somar a um produto que já existe</option>
                                        <option value="new">Cadastrar como produto novo</option>
                                        <option value="skip">Ignorar este item</option>
                                      </select>
                                      {r.action === 'link' && (
                                        <div style={{ marginTop: '4px' }}>
                                          {prod && !r.searching ? (
                                            <div style={{ fontSize: '0.75rem', color: styles.textMain }}>
                                              <strong>{prod.name}</strong> · estoque {prod.quantity} → <strong style={{ color: 'hsl(142,60%,30%)' }}>{Math.round((prod.quantity + toNum(r.qty)) * 1000) / 1000}</strong>
                                              {' '}<button type="button" onClick={() => patchRow(key, r.idx, { searching: true, search: '' })} style={{ background: 'none', border: 'none', color: styles.primary, textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>trocar</button>
                                              <label style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '3px', color: styles.sidebarWidgetText?.color, cursor: 'pointer' }}>
                                                <input type="checkbox" checked={r.updateCost} onChange={(e) => patchRow(key, r.idx, { updateCost: e.target.checked })} /> atualizar o custo do produto (hoje {brl(prod.cost_price)})
                                              </label>
                                            </div>
                                          ) : (
                                            <div>
                                              <input type="text" autoFocus placeholder="Buscar produto pelo nome ou código..." value={r.search} onChange={(e) => patchRow(key, r.idx, { search: e.target.value, searching: true })} style={smallInput} />
                                              {results.length > 0 && (
                                                <div style={{ border: `1px solid ${styles.borderColor}`, borderRadius: '8px', marginTop: '3px', backgroundColor: styles.isDark ? '#1e293b' : '#fff', maxHeight: '180px', overflowY: 'auto' }}>
                                                  {results.map(p => (
                                                    <button key={p.id} type="button" onClick={() => patchRow(key, r.idx, { productId: p.id, searching: false, search: '' })}
                                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', borderBottom: `1px solid ${styles.borderColor}`, background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: styles.textMain }}>
                                                      {p.name} <span style={{ color: styles.sidebarWidgetText?.color }}>· estoque {p.quantity}</span>
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {r.action === 'new' && (
                                        <select value={r.category} onChange={(e) => patchRow(key, r.idx, { category: e.target.value })} style={{ ...smallInput, marginTop: '4px' }} aria-label="Categoria do produto novo">
                                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>{active.length} nota(s) para lançar</span>
                  <button type="button" onClick={onClose} style={{ ...styles.btnAcc(false), padding: '10px 16px' }}>Cancelar</button>
                  <button type="button" onClick={apply} disabled={loading || active.length === 0} className="btn-save" style={{ ...styles.formSubmitBtn(false), margin: 0, width: 'auto', padding: '10px 22px', opacity: loading || active.length === 0 ? 0.5 : 1 }}>
                    {loading ? 'Lançando...' : 'Dar entrada no estoque'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
