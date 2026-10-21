import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { disablePush, enablePush, getPushState, notifyDriver } from '../utils/push';
import type { PushState } from '../utils/push';

interface PushSetupProps {
  styles: any;
  uid: string;
  name: string;
}

/** Cartão do entregador para ligar os avisos de nova entrega no celular (push). */
export const PushSetup: React.FC<PushSetupProps> = ({ styles, uid, name }) => {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await getPushState());
    } catch {
      setState('unsupported');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn: () => Promise<void>, okText?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (okText) setMessage({ ok: true, text: okText });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Algo deu errado.' });
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const test = () => run(async () => {
    const { sent } = await notifyDriver(uid);
    if (sent === 0) throw new Error('Não consegui enviar o aviso de teste. Confira a internet e se o endereço do emissor está configurado.');
    setMessage({ ok: true, text: 'Aviso de teste enviado! Em instantes ele deve aparecer no celular, com som.' });
  });

  if (state === 'loading') return null;

  const btn: React.CSSProperties = {
    padding: '8px 14px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`, background: 'none',
    color: styles.textMain, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
  };
  const on = state === 'on';

  return (
    <div style={{
      padding: '12px 14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px',
      border: `1px solid ${on ? 'hsl(142,60%,45%,0.4)' : styles.borderColor}`,
      backgroundColor: on ? 'hsl(142,60%,45%,0.06)' : styles.cardBackground || 'transparent',
    }}>
      <strong style={{ fontSize: '0.9rem', color: styles.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Bell size={16} /> Avisos de nova entrega
      </strong>

      {state === 'unsupported' && (
        <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
          Este navegador não suporta avisos. No Android, use o <strong>Google Chrome</strong>.
        </span>
      )}

      {state === 'denied' && (
        <span style={{ fontSize: '0.8rem', color: 'hsl(0,75%,45%)' }}>
          Os avisos estão <strong>bloqueados</strong> neste celular. Toque no cadeado ao lado do endereço do site →
          Permissões → Notificações → Permitir. Depois volte aqui.
        </span>
      )}

      {state === 'off' && (
        <>
          <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
            Ative para o celular tocar e vibrar quando uma nova entrega for atribuída a você, mesmo com a tela bloqueada.
          </span>
          <div>
            <button type="button" disabled={busy} className="btn-save" onClick={() => run(() => enablePush(uid, name), 'Avisos ativados neste celular.')}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '0.85rem' }}>
              {busy ? 'Ativando...' : 'Ativar avisos neste celular'}
            </button>
          </div>
        </>
      )}

      {on && (
        <>
          <span style={{ fontSize: '0.8rem', color: 'hsl(142,60%,28%)', fontWeight: 600 }}>
            ✓ Avisos ativados neste aparelho.
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} style={btn} onClick={test}>Testar aviso</button>
            <button type="button" disabled={busy} style={btn} onClick={() => run(disablePush, 'Avisos desativados neste celular.')}>Desativar</button>
          </div>
        </>
      )}

      {message && (
        <span role="status" style={{ fontSize: '0.8rem', color: message.ok ? 'hsl(142,60%,28%)' : 'hsl(0,75%,45%)' }}>{message.text}</span>
      )}
    </div>
  );
};
