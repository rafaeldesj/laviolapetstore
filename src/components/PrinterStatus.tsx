import React, { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  getPrinterSettings, savePrinterSettings, restorePrinterConnection, printMockOrder,
  connectPrinter, connectSerial, connectUsb,
  subscribeToBluetoothState, subscribeToSerialState, subscribeToUsbState,
} from '../utils/printer';
import type { PrinterSettings } from '../utils/printer';

interface PrinterStatusProps {
  styles: any;
}

const METHOD_LABEL: Record<PrinterSettings['method'], string> = {
  browser: 'Navegador (spooler do Windows)',
  bluetooth: 'Bluetooth',
  serial: 'USB (COM)',
  usb: 'USB direto',
};

/** Estado e conexão da impressora direto na tela do PDV, sem precisar abrir as Configurações. */
export const PrinterStatus: React.FC<PrinterStatusProps> = ({ styles }) => {
  const [settings, setSettings] = useState<PrinterSettings>(() => getPrinterSettings());
  const [connected, setConnected] = useState<Record<string, boolean>>({ bluetooth: false, serial: false, usb: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const set = (k: string) => (c: boolean) => setConnected(prev => ({ ...prev, [k]: c }));
    const unsubs = [
      subscribeToBluetoothState(set('bluetooth')),
      subscribeToSerialState(set('serial')),
      subscribeToUsbState(set('usb')),
    ];
    restorePrinterConnection();
    return () => unsubs.forEach(u => u());
  }, []);

  const isBrowser = settings.method === 'browser';
  const isConnected = isBrowser || connected[settings.method];

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: okText });
    } catch (e) {
      // Fechar o seletor de dispositivos do navegador não é erro.
      if (e instanceof DOMException && e.name === 'NotFoundError') return;
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Falha na impressora.' });
    } finally {
      setBusy(false);
    }
  };

  const connect = () => {
    if (settings.method === 'bluetooth') return run(connectPrinter, 'Impressora conectada.');
    if (settings.method === 'serial') return run(() => connectSerial(settings.baudRate), 'Impressora conectada.');
    if (settings.method === 'usb') return run(connectUsb, 'Impressora conectada.');
  };

  const changeMethod = (method: PrinterSettings['method']) => {
    const next = { ...settings, method };
    setSettings(next);
    savePrinterSettings(next);
    setMessage(null);
    restorePrinterConnection();
  };

  const btn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`,
    background: 'none', color: styles.textMain, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
  };

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '12px',
      padding: '8px 12px', borderRadius: '10px', border: `1px solid ${styles.borderColor}`,
      backgroundColor: styles.cardBackground || 'transparent', fontSize: '0.78rem',
    }}>
      <Printer size={16} style={{ color: styles.primary }} />
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: isConnected ? '#10b981' : '#ef4444' }} />
      <strong style={{ color: styles.textMain }}>
        {isConnected ? 'Impressora pronta' : 'Impressora desconectada'}
      </strong>
      <select
        aria-label="Método de impressão"
        value={settings.method}
        onChange={(e) => changeMethod(e.target.value as PrinterSettings['method'])}
        style={{ ...btn, background: styles.cardBackground || 'transparent' }}
      >
        {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {!isBrowser && !isConnected && (
        <button type="button" disabled={busy} onClick={connect} style={{ ...btn, color: styles.primary, borderColor: styles.primary }}>
          {busy ? 'Conectando...' : 'Conectar'}
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => run(printMockOrder, 'Cupom de teste enviado.')} style={btn}>
        Imprimir teste
      </button>
      {message && (
        <span role="status" style={{ color: message.ok ? '#10b981' : 'hsl(0,75%,55%)', flexBasis: '100%' }}>{message.text}</span>
      )}
    </div>
  );
};
