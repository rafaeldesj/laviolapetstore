import React from 'react';
import { PAYMENT_METHOD_LABEL, brl, changeToGive } from '../utils/deliveryPayment';
import type { DeliveryPayment } from '../utils/deliveryPayment';

interface DeliveryPaymentBoxProps {
  payment?: DeliveryPayment | null;
  /** Versão compacta, para tabelas. */
  compact?: boolean;
}

/** Aviso claro de como a entrega é paga. Para o entregador, é o que ele precisa cobrar e levar. */
export const DeliveryPaymentBox: React.FC<DeliveryPaymentBoxProps> = ({ payment, compact = false }) => {
  if (!payment) return null;

  if (payment.status === 'pago') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: compact ? '2px 8px' : '6px 10px', borderRadius: '8px',
        backgroundColor: 'hsl(142,60%,45%,0.12)', border: '1px solid hsl(142,60%,40%,0.4)',
        color: 'hsl(142,60%,24%)', fontWeight: 700, fontSize: compact ? '0.72rem' : '0.82rem',
      }}>
        ✓ JÁ PAGO{compact ? '' : ' — não cobrar nada'}
      </div>
    );
  }

  const method = payment.method;
  const troco = changeToGive(payment);

  if (compact) {
    return (
      <div style={{
        padding: '3px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.35,
        backgroundColor: 'hsl(36,95%,45%,0.14)', border: '1px solid hsl(36,95%,40%,0.5)', color: 'hsl(30,90%,24%)',
      }}>
        💰 Cobrar {brl(payment.amount || 0)}{method ? ` · ${PAYMENT_METHOD_LABEL[method]}` : ''}
        {method === 'dinheiro' && (payment.needs_change ? ` · troco p/ ${brl(payment.change_for || 0)}` : ' · sem troco')}
      </div>
    );
  }

  return (
    <div role="note" style={{
      padding: '10px 12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px',
      backgroundColor: 'hsl(36,95%,45%,0.14)', border: '2px solid hsl(36,95%,40%,0.6)', color: 'hsl(30,90%,22%)',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.05em' }}>💰 COBRAR NA ENTREGA</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.1 }}>{brl(payment.amount || 0)}</div>
      <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>
        {method ? `Forma de pagamento: ${PAYMENT_METHOD_LABEL[method]}` : 'Forma de pagamento: confirmar com o cliente'}
      </div>

      {method === 'dinheiro' && (payment.needs_change ? (
        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'hsl(0,70%,32%)' }}>
          ⚠ Cliente paga com {brl(payment.change_for || 0)} → LEVAR {brl(troco)} DE TROCO
        </div>
      ) : (
        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Não precisa de troco (valor certo).</div>
      ))}

      {(method === 'debito' || method === 'credito') && (
        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>💳 Levar a maquininha de cartão.</div>
      )}
      {method === 'pix' && (
        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Confirme o Pix no seu celular antes de entregar o pedido.</div>
      )}
    </div>
  );
};
