import React, { useState } from 'react';
import { 
  Home, Scissors, Tag, Info, Phone,
  PawPrint, CalendarDays, Wallet, Package, 
  ClipboardList, BarChart3, Users, History, Settings, CreditCard, ShoppingCart, Menu, X
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
  requiresStaff?: boolean;
  requiresClientOnly?: boolean;
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const isDesktop = styles.layoutGrid?.gridTemplateColumns?.includes('200px') ||
    styles.layoutGrid?.gridTemplateColumns?.includes('220px') ||
    styles.layoutGrid?.gridTemplateColumns?.includes('264px');
  const primary = styles.primary || 'hsl(210, 85%, 45%)';

  const isManager = userRole ? roleHierarchy[userRole] >= roleHierarchy['manager'] : false;
  const isStaff = userRole ? roleHierarchy[userRole] >= roleHierarchy['collaborator'] : false;
  const isClient = userRole === 'client';

  const allNavItems: NavItem[] = [
    { id: 'inicio',       label: 'Início',               icon: <Home size={16} />,          requiresLogin: false },
    { id: 'servicos',     label: 'Serviços',             icon: <Scissors size={16} />,      requiresLogin: false },
    { id: 'promocoes',    label: 'Promoções',            icon: <Tag size={16} />,           requiresLogin: false },
    { id: 'venda-avulsa', label: 'Venda Avulsa PDV',    icon: <ShoppingCart size={16} />,  requiresLogin: true },
    { id: 'pets',         label: 'Pets',                 icon: <PawPrint size={16} />,      requiresLogin: true },
    { id: 'agendamentos', label: 'Agendamentos',         icon: <CalendarDays size={16} />,  requiresLogin: true },
    { id: 'pagamentos',   label: 'Pagamentos',           icon: <CreditCard size={16} />,    requiresLogin: true, requiresClientOnly: true },
    { id: 'financeiro',   label: 'Financeiro / Caixa',  icon: <Wallet size={16} />,        requiresLogin: true, requiresManager: true },
    { id: 'estoque',      label: 'Estoque / Produtos',  icon: <Package size={16} />,       requiresLogin: true, requiresStockAccess: true },
    { id: 'prontuario',   label: 'Prontuário Vet.',     icon: <ClipboardList size={16} />, requiresLogin: true, requiresStaff: true },
    { id: 'relatorios',   label: 'Relatórios',          icon: <BarChart3 size={16} />,     requiresLogin: true, requiresStaff: true },
    { id: 'usuarios',     label: 'Usuários',            icon: <Users size={16} />,         requiresLogin: true, requiresManager: true },
    { id: 'registros',    label: 'Registros',           icon: <History size={16} />,       requiresLogin: true, requiresManager: true },
    { id: 'configuracoes',label: 'Configurações',       icon: <Settings size={16} />,      requiresLogin: true, requiresOwnerDev: true },
    { id: 'sobre',        label: 'Sobre Nós',           icon: <Info size={16} />,          requiresLogin: false },
    { id: 'contato',      label: 'Contato',             icon: <Phone size={16} />,         requiresLogin: false },
  ];

  const isOwnerOrDev = userRole === 'developer' || userRole === 'owner';
  const isStockAllowed = isLoggedIn && (
    userRole === 'developer' ||
    userRole === 'owner' ||
    userRole === 'manager' ||
    userSpecialty === 'Estoquista'
  );

  const visibleItems = allNavItems.filter(item => {
    if (item.requiresClientOnly) return isLoggedIn && isClient;
    if (item.requiresStaff)      return isLoggedIn && isStaff;
    if (item.requiresStockAccess) return isStockAllowed;
    if (item.requiresOwnerDev) return isLoggedIn && isOwnerOrDev;
    if (item.requiresManager) return isLoggedIn && isManager;
    if (item.requiresLogin) return isLoggedIn;
    return true;
  });

  const publicItems = visibleItems.filter(i => !i.requiresLogin);
  const privateItems = visibleItems.filter(i => i.requiresLogin);
  const hasPrivate = privateItems.length > 0;

  const handleNavClick = (id: string) => {
    setActiveSection(id);
    setMobileOpen(false);
  };

  const renderItem = (item: NavItem) => {
    const isActive = activeSection === item.id;
    const isHovered = hoveredLink === item.id;
    return (
      <li key={item.id} style={{ width: '100%' }}>
        <button
          onClick={() => handleNavClick(item.id)}
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

  if (isDesktop) {
    // Desktop: normal sidebar
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
  }

  // Mobile: hamburger menu
  const activeLabel = visibleItems.find(i => i.id === activeSection)?.label || 'Menu';

  return (
    <>
      {/* Mobile hamburger button bar */}
      <nav
        role="navigation"
        aria-label="Menu Principal"
        style={{
          backgroundColor: primary,
          borderRadius: '10px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          position: 'relative',
          zIndex: 200,
        }}
      >
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {visibleItems.find(i => i.id === activeSection)?.icon}
          {activeLabel}
        </span>
        <button
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={mobileOpen}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '6px 8px',
          }}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile dropdown overlay */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 300,
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
          />
          {/* Menu panel */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: '260px',
              backgroundColor: primary,
              zIndex: 400,
              boxShadow: '4px 0 20px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: '16px 12px',
              gap: '4px',
            }}
          >
            {/* Close button at top right */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>La Viola Petshop</span>
              <button
                onClick={() => setMobileOpen(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', padding: '6px 8px', display: 'flex' }}
              >
                <X size={20} />
              </button>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {publicItems.map(renderItem)}
              {hasPrivate && (
                <>
                  <li style={{ 
                    width: '100%', padding: '10px 10px 4px',
                    fontSize: '0.68rem', fontWeight: 700, letterSpacing: '1px',
                    color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
                    borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: '8px'
                  }}>
                    Sistema
                  </li>
                  {privateItems.map(renderItem)}
                </>
              )}
            </ul>
          </div>
        </>
      )}
    </>
  );
};
