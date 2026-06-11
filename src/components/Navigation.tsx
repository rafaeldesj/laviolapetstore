import React, { useState } from 'react';
import type { UserRole } from '../supabaseClient';
import { roleHierarchy } from '../supabaseClient';

interface NavigationProps {
  styles: any;
  activeSection: string;
  setActiveSection: (section: string) => void;
  isLoggedIn: boolean;
  userRole?: UserRole;
}

export const Navigation: React.FC<NavigationProps> = ({ styles, activeSection, setActiveSection, isLoggedIn, userRole }) => {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  const isManager = userRole ? roleHierarchy[userRole] >= roleHierarchy['manager'] : false;

  const navItems = [
    { id: 'inicio', label: 'Início', always: true },
    { id: 'servicos', label: 'Serviços', always: true },
    { id: 'promocoes', label: 'Promoções', always: true },
    ...(isLoggedIn ? [{ id: 'pets', label: 'Meus Pets', always: false }] : []),
    ...(isManager ? [{ id: 'usuarios', label: 'Usuários', always: false }] : []),
    { id: 'sobre', label: 'Sobre Nós', always: true },
    { id: 'contato', label: 'Contato', always: true },
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

