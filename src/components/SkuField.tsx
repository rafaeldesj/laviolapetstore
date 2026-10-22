import React, { useRef, useState } from 'react';
import { Barcode } from 'lucide-react';

interface SkuFieldProps {
  id: string;
  styles: any;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Campo de código SKU / barras com atalho para o leitor: o botão põe o cursor no campo e fica
 * aguardando a leitura. O leitor digita o código e aperta Enter sozinho; aqui o Enter não envia o formulário.
 */
export const SkuField: React.FC<SkuFieldProps> = ({ id, styles, value, onChange, placeholder }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [waiting, setWaiting] = useState(false);
  const [read, setRead] = useState(false);

  const arm = () => {
    onChange('');
    setRead(false);
    setWaiting(true);
    ref.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (value.trim()) {
      setWaiting(false);
      setRead(true);
    }
  };

  const border = waiting ? styles.primary : read ? 'hsl(142,60%,40%)' : styles.borderColor;

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          id={id}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => { setRead(false); onChange(e.target.value.trim()); }}
          onKeyDown={onKeyDown}
          onFocus={() => setWaiting(w => w)}
          onBlur={() => setWaiting(false)}
          style={{ ...styles.formInput, flex: 1, minWidth: 0, borderColor: border }}
          placeholder={waiting ? 'Aponte o leitor para o código de barras...' : placeholder}
        />
        <button
          type="button"
          onClick={arm}
          title="Ler com o leitor de código de barras"
          aria-label="Ler código de barras com o leitor"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0 12px', borderRadius: '8px',
            border: `1px solid ${styles.primary}`, background: waiting ? styles.primary : 'transparent',
            color: waiting ? '#fff' : styles.primary, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >
          <Barcode size={16} /> Ler
        </button>
      </div>
      {(waiting || read) && (
        <span role="status" style={{ fontSize: '0.75rem', fontWeight: 600, color: read ? 'hsl(142,60%,28%)' : styles.primary }}>
          {read ? '✓ Código lido.' : 'Aguardando o leitor... escaneie o produto.'}
        </span>
      )}
    </div>
  );
};
