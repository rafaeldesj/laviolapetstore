import React, { useMemo, useState } from 'react';
import { formatQty, lineTotal, parseQty, roundQty, unitShort } from '../utils/units';
import { brl, parseMoney } from '../utils/deliveryPayment';

interface QuantityDialogProps {
  styles: any;
  product: { name: string; price: number; unit?: string | null; quantity?: number };
  mode: 'add' | 'edit';
  /** Quantidade que já está no carrinho (para conferir o estoque ao somar mais). */
  alreadyInCart?: number;
  /** Ao editar, a quantidade atual. */
  initialQty?: number;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}

/** Pergunta quanto vai levar de um produto vendido por peso: pelo peso (kg) ou por um valor em reais. */
export const QuantityDialog: React.FC<QuantityDialogProps> = ({ styles, product, mode, alreadyInCart = 0, initialQty, onConfirm, onClose }) => {
  const short = unitShort(product.unit || undefined);
  const [by, setBy] = useState<'peso' | 'valor'>('peso');
  const [text, setText] = useState<string>(initialQty ? String(initialQty).replace('.', ',') : '');

  const qty = useMemo(() => {
    if (by === 'peso') return parseQty(text);
    const money = parseMoney(text);
    return product.price > 0 && Number.isFinite(money) && money > 0 ? roundQty(money / product.price) : NaN;
  }, [by, text, product.price]);

  const available = product.quantity === undefined ? Infinity : roundQty(product.quantity - (mode === 'add' ? alreadyInCart : 0));
  const valid = Number.isFinite(qty) && qty > 0;
  const overStock = valid && qty > available;
  const canConfirm = valid && !overStock;

  const quick = by === 'peso'
    ? [{ label: `0,250 ${short}`, v: '0,25' }, { label: `0,500 ${short}`, v: '0,5' }, { label: `1 ${short}`, v: '1' }, { label: `2 ${short}`, v: '2' }]
    : [{ label: 'R$ 10', v: '10' }, { label: 'R$ 20', v: '20' }, { label: 'R$ 50', v: '50' }];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canConfirm) onConfirm(qty);
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '8px 10px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '0.82rem', fontWeight: active ? 700 : 600,
    borderColor: active ? styles.primary : styles.borderColor,
    backgroundColor: active ? (styles.isDark ? '#334155' : '#e2e8f0') : 'transparent',
    color: active ? styles.primary : styles.textMain,
  });

  return (
    <div style={{ ...styles.modalOverlay, zIndex: 10000 }}>
      <form onSubmit={submit} style={{ ...styles.modalContent, maxWidth: '420px' }} role="dialog" aria-modal="true" aria-labelledby="qty-title">
        <div style={styles.modalHeader}>
          <h2 id="qty-title" style={{ ...styles.modalTitle, fontSize: '1.1rem' }}>Quanto vai levar?</h2>
          <button type="button" onClick={onClose} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
        </div>

        <div style={{ fontSize: '0.88rem', color: styles.textMain }}>
          <strong>{product.name}</strong>
          <div style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.8rem' }}>
            {brl(product.price)} por {short}
            {product.quantity !== undefined && <> · em estoque: {formatQty(product.quantity, product.unit)}</>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
          <button type="button" style={chip(by === 'peso')} onClick={() => { setBy('peso'); setText(''); }}>Pelo peso ({short})</button>
          <button type="button" style={chip(by === 'valor')} onClick={() => { setBy('valor'); setText(''); }}>Por valor (R$)</button>
        </div>

        <div style={styles.formGroup}>
          <label htmlFor="qty-input" style={styles.formLabel}>{by === 'peso' ? `Quantos ${short}?` : 'Quanto em reais?'}</label>
          <input
            id="qty-input"
            type="text"
            inputMode="decimal"
            autoFocus
            autoComplete="off"
            placeholder={by === 'peso' ? 'Ex.: 0,350' : 'Ex.: 20'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ ...styles.formInput, width: '100%', minWidth: 0, fontSize: '1.1rem', fontWeight: 700 }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {quick.map(q => (
            <button key={q.v} type="button" style={chip(false)} onClick={() => setText(q.v)}>{q.label}</button>
          ))}
        </div>

        {valid && (
          <div role="status" style={{
            padding: '10px 12px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 700,
            backgroundColor: overStock ? 'hsl(0,75%,55%,0.08)' : 'hsl(142,60%,45%,0.1)',
            color: overStock ? 'hsl(0,75%,42%)' : 'hsl(142,60%,25%)',
          }}>
            {overStock
              ? `Só há ${formatQty(Math.max(0, available), product.unit)} disponíveis em estoque.`
              : by === 'peso'
                ? `${formatQty(qty, product.unit)} = ${brl(lineTotal(product.price, qty))}`
                : `${brl(lineTotal(product.price, qty))} = ${formatQty(qty, product.unit)}`}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`, background: 'none', color: styles.textMain, cursor: 'pointer', fontSize: '0.85rem' }}>
            Cancelar
          </button>
          <button type="submit" disabled={!canConfirm} className="btn-save" style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', fontSize: '0.85rem', fontWeight: 700, opacity: canConfirm ? 1 : 0.5 }}>
            {mode === 'add' ? 'Adicionar ao carrinho' : 'Salvar quantidade'}
          </button>
        </div>
      </form>
    </div>
  );
};
