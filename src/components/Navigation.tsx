import React, { useState } from 'react';

interface NavigationProps {
  styles: any;
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ styles, activeSection, setActiveSection }) => {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  const navItems = [
    { id: 'inicio', label: 'Início' },
    { id: 'servicos', label: 'Serviços' },
    { id: 'promocoes', label: 'Promoções' },
    { id: 'sobre', label: 'Sobre Nós' },
    { id: 'contato', label: 'Contato' }
  ];

  return (
    <nav style={styles.siteNavigation} role="navigation" aria-label="Menu Principal">
      <ul style={styles.navList}>
        {navItems.map((item) => (
          <li key={item.id} style={{ width: '100%' }}>
            <button 
              onClick={() => setActiveSection(item.id)}
              onMouseEnter={() => setHoveredLink(item.id)}
              onMouseLeave={() => setHoveredLink(null)}
              style={{
                ...styles.navLink(activeSection === item.id, hoveredLink === item.id),
                background: (activeSection === item.id || hoveredLink === item.id) ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                display: 'block',
                width: '100%',
                ...(styles.highContrast && hoveredLink === item.id && {
                  backgroundColor: '#ffff00',
                  color: '#000000'
                })
              }}
              aria-current={activeSection === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};
