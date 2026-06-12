import React, { useState } from 'react';
import { 
  Home, Scissors, Tag, Info, Phone,
  PawPrint, CalendarDays, Wallet, Package, 
  ClipboardList, BarChart3, Users, History, Settings
} from 'lucide-react';
import type { UserRole } from '../supabaseClient';
import { roleHierarchy } from '../supabaseClient';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  requiresLogin?: boolean;
  requiresManager?: boolean;
  requiresOwnerDev?: boolean;
  requiresStockAccess?: boolean;
}

interface NavigationProps {
  styles: any;
  activeSection: string;
  setActiveSection: (section: string) => void;
  isLoggedIn: boolean;
  userRole?: UserRole;
  userSpecialty?: string | null;
}

export const Navigation: React.FC<NavigationProps> = ({ styles, activeSection, setActiveSection, isLoggedIn, userRole, userSpecialty }) => {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  const isManager = userRole ? roleHierarchy[userRole] >= roleHierarchy['manager'] : false;

  const allNavItems: NavItem[] = [
    { id: 'inicio',     label: 'Início',                  icon: <Home size={16} />,          requiresLogin: false },
    { id: 'servicos',   label: 'Serviços',                 icon: <Scissors size={16} />,      requiresLogin: false },
    { id: 'promocoes',  label: 'Promoções',                icon: <Tag size={16} />,           requiresLogin: false },
    { id: 'pets',       label: 'Pets',                     icon: <PawPrint size={16} />,      requiresLogin: true },
    { id: 'agendamentos', label: 'Agendamentos',           icon: <CalendarDays size={16} />,  requiresLogin: true },
    { id: 'financeiro', label: 'Financeiro / Caixa',       icon: <Wallet size={16} />,        requiresLogin: true },
    { id: 'estoque',    label: 'Estoque / Produtos',       icon: <Package size={16} />,       requiresLogin: true, requiresStockAccess: true },
    { id: 'prontuario', label: 'Prontuário Vet.',          icon: <ClipboardList size={16} />, requiresLogin: true },
    { id: 'relatorios', label: 'Relatórios',               icon: <BarChart3 size={16} />,     requiresLogin: true },
    { id: 'usuarios',   label: 'Usuários',                 icon: <Users size={16} />,         requiresLogin: true, requiresManager: true },
    { id: 'registros',  label: 'Registros',                icon: <History size={16} />,       requiresLogin: true, requiresManager: true },
    { id: 'configuracoes', label: 'Configurações',         icon: <Settings size={16} />,      requiresLogin: true, requiresOwnerDev: true },
    { id: 'sobre',      label: 'Sobre Nós',                icon: <Info size={16} />,          requiresLogin: false },
    { id: 'contato',    label: 'Contato',                  icon: <Phone size={16} />,         requiresLogin: false },
  ];

  const isOwnerOrDev = userRole === 'developer' || userRole === 'owner';
  const isStockAllowed = isLoggedIn && (
    userRole === 'developer' ||
    userRole === 'owner' ||
    userRole === 'manager' ||
    userSpecialty === 'Estoquista'
  );

  const visibleItems = allNavItems.filter(item => {
    if (item.requiresStockAccess) return isStockAllowed;
    if (item.requiresOwnerDev) return isLoggedIn && isOwnerOrDev;
    if (item.requiresManager) return isLoggedIn && isManager;
    if (item.requiresLogin) return isLoggedIn;
    return true;
  });

  const publicItems = visibleItems.filter(i => !i.requiresLogin);
  const privateItems = visibleItems.filter(i => i.requiresLogin);
  const hasPrivate = privateItems.length > 0;

  const renderItem = (item: NavItem) => {
    const isActive = activeSection === item.id;
    const isHovered = hoveredLink === item.id;
    return (
      <li key={item.id} style={{ width: '100%' }}>
        <button
          onClick={() => setActiveSection(item.id)}
          onMouseEnter={() => setHoveredLink(item.id)}
          onMouseLeave={() => setHoveredLink(null)}
          style={{
            ...styles.navLink(isActive, isHovered),
            background: (isActive || isHovered) ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
          }}
          aria-current={isActive ? 'page' : undefined}
        >
          {item.icon}
          {item.label}
        </button>
      </li>
    );
  };

  return (
    <nav style={styles.siteNavigation} role="navigation" aria-label="Menu Principal">
      <ul style={{ ...styles.navList, flexDirection: 'column' }}>
        {publicItems.map(renderItem)}

        {hasPrivate && (
          <>
            <li style={{ 
              width: '100%', padding: '6px 10px 4px',
              fontSize: '0.68rem', fontWeight: 700, letterSpacing: '1px',
              color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
              borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: '4px'
            }}>
              Sistema
            </li>
            {privateItems.map(renderItem)}
          </>
        )}
      </ul>
    </nav>
  );
};

