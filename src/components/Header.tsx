import React, { useState } from 'react';
import { PawPrint, Type, SunMoon, RefreshCw } from 'lucide-react';

interface HeaderProps {
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  highContrast: boolean;
  setHighContrast: React.Dispatch<React.SetStateAction<boolean>>;
  styles: any;
}

export const Header: React.FC<HeaderProps> = ({
  fontSize,
  setFontSize,
  highContrast,
  setHighContrast,
  styles,
}) => {
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const increaseFont = () => {
    if (fontSize < 24) setFontSize(prev => prev + 2);
  };

  const decreaseFont = () => {
    if (fontSize > 12) setFontSize(prev => prev - 2);
  };

  const resetFont = () => {
    setFontSize(16);
  };

  const toggleContrast = () => {
    setHighContrast(prev => !prev);
  };

  return (
    <header style={styles.siteHeader} role="banner">
      <div style={styles.siteLogo}>
        <PawPrint style={styles.logoSvg} aria-hidden="true" />
        <h1 style={styles.logoTitle}>La Viola Petshop</h1>
      </div>

      <div style={styles.accessibilityControls} aria-label="Controles de Acessibilidade">
        <button 
          onClick={decreaseFont} 
          style={styles.btnAcc(hoveredBtn === 'decrease')}
          onMouseEnter={() => setHoveredBtn('decrease')}
          onMouseLeave={() => setHoveredBtn(null)}
          title="Diminuir tamanho da fonte"
          aria-label="Diminuir tamanho da fonte"
        >
          <Type size={16} aria-hidden="true" />- A-
        </button>
        <button 
          onClick={resetFont} 
          style={styles.btnAcc(hoveredBtn === 'reset')}
          onMouseEnter={() => setHoveredBtn('reset')}
          onMouseLeave={() => setHoveredBtn(null)}
          title="Resetar tamanho da fonte"
          aria-label="Resetar tamanho da fonte para o padrão"
        >
          <RefreshCw size={14} aria-hidden="true" /> Padrão
        </button>
        <button 
          onClick={increaseFont} 
          style={styles.btnAcc(hoveredBtn === 'increase')}
          onMouseEnter={() => setHoveredBtn('increase')}
          onMouseLeave={() => setHoveredBtn(null)}
          title="Aumentar tamanho da fonte"
          aria-label="Aumentar tamanho da fonte"
        >
          <Type size={16} aria-hidden="true" />+ A+
        </button>
        <button 
          onClick={toggleContrast} 
          style={styles.btnAcc(hoveredBtn === 'contrast')}
          onMouseEnter={() => setHoveredBtn('contrast')}
          onMouseLeave={() => setHoveredBtn(null)}
          title="Alternar Alto Contraste"
          aria-label="Alternar modo de alto contraste"
        >
          <SunMoon size={16} aria-hidden="true" /> {highContrast ? 'Contraste Normal' : 'Alto Contraste'}
        </button>
      </div>
    </header>
  );
};
