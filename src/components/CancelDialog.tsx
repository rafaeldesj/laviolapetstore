import React, { useState } from 'react';
import { cancelNfce, cancelWindow } from '../utils/fiscal';
import type { FiscalSettings } from '../utils/fiscal';
import { voidSale } from '../utils/salesService';
import type { Sale } from '../utils/salesService';

interface CancelDialogProps {
  styles: any;
  sale: Sale;
  cfg: FiscalSettings;
  onClose: () => void;
  /** Recebe a venda já atualizada e uma mensagem pronta para mostrar na tela. */
  onDone: (updated: Sale, message: string) => void;
}

const REASONS = [
  'Erro de digitação nos itens ou valores',
  'Cliente desistiu da compra',
  'Forma de pagamento lançada errada',
];

/**
 * Cancela a nota fiscal (quando existe) e/ou a venda. Para corrigir um erro de digitação o caminho é:
 * cancelar a nota + cancelar a venda (os produtos voltam ao estoque) e refazer a venda certa.
 */
export const CancelDialog: React.FC<CancelDialogProps> = ({ styles, sale, cfg, onClose, onDone }) => {
  const hasNote = sale.fiscal?.status === 'autorizada';
  const win = hasNote ? cancelWindow(sale, cfg) : { allowed: true, minutesLeft: Infinity };

  const [reason, setReason] = useState(REASONS[0]);
  const [extra, setExtra] = useState('');
  const [goodsStayed, setGoodsStayed] = useState(false);
  const [alsoVoid, setAlsoVoid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = `${reason}${extra.trim() ? ` - ${extra.trim()}` : ''}`;
  const canConfirm = !busy && win.allowed && (!hasNote || goodsStayed);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    let updated = sale;
    try {
      if (hasNote) {
        updated = { ...updated, fiscal: await cancelNfce(updated, cfg, text) };
      }
      if (!hasNote || alsoVoid) {
        updated = await voidSale(updated, text);
      }
      const message = hasNote
        ? alsoVoid
          ? `Venda #${sale.number} e nota fiscal canceladas. Os produtos voltaram ao estoque — agora é só refazer a venda certa.`
          : `Nota fiscal da venda #${sale.number} cancelada. A venda continua registrada.`
        : `Venda #${sale.number} cancelada. Os produtos voltaram ao estoque.`;
      onDone(updated, message);
    } catch (e) {
      // Se a nota já foi cancelada mas a venda não, mostramos o estado real em vez de deixar a tela desatualizada.
      if (updated !== sale) onDone(updated, 'A nota foi cancelada, mas não consegui cancelar a venda. Abra a venda em Financeiro → Notas fiscais e cancele-a de novo.');
      else setError(e instanceof Error ? e.message : 'Não foi possível cancelar.');
    } finally {
      setBusy(false);
    }
  };

  const hoursLabel = `${cfg.cancel_horas || 24} horas`;

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, maxWidth: '480px' }} role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <div style={styles.modalHeader}>
          <h2 id="cancel-title" style={styles.modalTitle}>
            {hasNote ? `Cancelar a nota da venda #${sale.number}` : `Cancelar a venda #${sale.number}`}
          </h2>
          <button onClick={onClose} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
        </div>

        {hasNote && !win.allowed ? (
          <>
            <p role="alert" style={{ fontSize: '0.88rem', color: 'hsl(0,75%,45%)', marginBottom: '16px' }}>
              O prazo para cancelar esta nota ({hoursLabel} depois de emitida) já passou, então o governo não aceita mais o cancelamento.
              Fale com o contador para saber como corrigir.
            </p>
            <div style={{ textAlign: 'right' }}>
              <button type="button" onClick={onClose} className="btn-save" style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', fontWeight: 700 }}>Entendi</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.83rem', marginBottom: '12px' }}>
              {hasNote
                ? <>Dá para cancelar em até <strong>{hoursLabel}</strong> depois de emitir, e <strong>só se a mercadoria ainda não saiu da loja</strong>.
                    {Number.isFinite(win.minutesLeft) && win.minutesLeft < 24 * 60 && <> Ainda restam cerca de <strong>{Math.max(1, Math.round(win.minutesLeft / 60))} h</strong>.</>}</>
                : <>Os produtos desta venda voltam ao estoque e ela deixa de contar nos totais.</>}
            </p>

            <label style={styles.formLabel} htmlFor="cancel-reason">Motivo</label>
            <select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...styles.formInput, marginBottom: '10px' }}>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <label style={styles.formLabel} htmlFor="cancel-extra">Quer explicar melhor? (opcional)</label>
            <input id="cancel-extra" type="text" value={extra} onChange={(e) => setExtra(e.target.value)} style={{ ...styles.formInput, marginBottom: '14px' }} />

            {hasNote && (
              <>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.83rem', marginBottom: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={goodsStayed} onChange={(e) => setGoodsStayed(e.target.checked)} style={{ marginTop: '3px' }} />
                  <span>Confirmo que a mercadoria <strong>ainda não saiu da loja</strong>.</span>
                </label>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.83rem', marginBottom: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={alsoVoid} onChange={(e) => setAlsoVoid(e.target.checked)} style={{ marginTop: '3px' }} />
                  <span>Cancelar também a venda e <strong>devolver os produtos ao estoque</strong> (marque se vai refazer a venda).</span>
                </label>
              </>
            )}

            {error && (
              <div role="alert" style={{ padding: '9px 12px', borderRadius: '8px', fontSize: '0.83rem', marginBottom: '12px', color: 'hsl(0,75%,45%)', background: 'hsl(0,75%,55%,0.08)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`, background: 'none', color: styles.textMain, cursor: 'pointer', fontWeight: 600 }}>
                Voltar
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={confirm}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'hsl(0,75%,50%)', color: '#fff', fontWeight: 700, cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5 }}
              >
                {busy ? 'Cancelando...' : hasNote ? 'Sim, cancelar a nota' : 'Sim, cancelar a venda'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
