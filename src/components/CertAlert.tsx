import React from 'react';
import { certStatus } from '../utils/fiscal';
import type { FiscalSettings } from '../utils/fiscal';

/** Aviso para o dono: o certificado digital vence em breve (ou já venceu) e as notas param de sair. */
export const CertAlert: React.FC<{ cfg: FiscalSettings }> = ({ cfg }) => {
  const st = certStatus(cfg);
  if (!cfg.enabled || !st || st.level === 'ok') return null;

  const expired = st.level === 'expired';
  return (
    <div role="alert" style={{
      margin: '12px 0', padding: '10px 14px', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600,
      color: expired ? 'hsl(0,75%,40%)' : 'hsl(36,95%,28%)',
      background: expired ? 'hsl(0,75%,55%,0.1)' : 'hsl(36,95%,45%,0.1)',
      border: `1px solid ${expired ? 'hsl(0,75%,55%,0.3)' : 'hsl(36,95%,45%,0.3)'}`,
    }}>
      {expired
        ? '⛔ O certificado digital venceu — não dá mais para emitir notas. Peça a renovação ao responsável pela empresa e depois envie o arquivo novo ao emissor.'
        : `⚠ O certificado digital vence em ${st.days} dia${st.days === 1 ? '' : 's'}. Avise o dono da loja para renová-lo a tempo; sem ele as notas deixam de sair.`}
    </div>
  );
};
