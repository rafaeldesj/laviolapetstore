import React, { useState } from 'react';
import { PawPrint, LogIn, LogOut, User } from 'lucide-react';
import type { UserRole } from '../supabaseClient';
import { roleLabels } from '../supabaseClient';

interface HeaderProps {
  user: {
    name: string;
    profile?: {
      role: UserRole;
      collaborator_category?: { name: string } | null;
    } | null;
  } | null;
  onLoginClick: () => void;
  onLogout: () => void;
  styles: any;
}

const roleBadgeColors: Record<UserRole, string> = {
  developer: 'hsl(280, 70%, 55%)',
  owner: 'hsl(36, 95%, 50%)',
  manager: 'hsl(210, 85%, 45%)',
  collaborator: 'hsl(142, 60%, 45%)',
  client: 'hsl(220, 15%, 55%)',
};

export const Header: React.FC<HeaderProps> = ({
  user,
  onLoginClick,
  onLogout,
  styles,
}) => {
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const role = user?.profile?.role;

  return (
    <header style={styles.siteHeader} role="banner">
      <div style={styles.siteLogo}>
        <PawPrint style={styles.logoSvg} aria-hidden="true" />
        <h1 style={styles.logoTitle}>La Viola Petshop</h1>
      </div>

      <div style={styles.authContainer}>
        {user ? (
          <div style={styles.userInfo}>
            <div style={{
              ...styles.userAvatar,
              backgroundColor: role ? roleBadgeColors[role] + '22' : undefined,
              color: role ? roleBadgeColors[role] : styles.primary,
              border: `1px solid ${role ? roleBadgeColors[role] + '44' : styles.borderColor}`,
            }} aria-hidden="true">
              <User size={16} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={styles.userName}>Olá, {user.name}</span>
            {role && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
                  color: roleBadgeColors[role], textTransform: 'uppercase',
                }}>
                  {roleLabels[role]}
                  {user?.profile?.collaborator_category?.name && (
                    <span style={{
                      fontWeight: 500,
                      textTransform: 'none',
                      opacity: 0.85,
                      letterSpacing: '0.2px',
                    }}>
                      {' '}({user.profile.collaborator_category.name})
                    </span>
                  )}
                </span>
              )}
            </div>
            <button
              onClick={onLogout}
              style={styles.btnLogout(hoveredBtn === 'logout')}
              onMouseEnter={() => setHoveredBtn('logout')}
              onMouseLeave={() => setHoveredBtn(null)}
              title="Sair da conta"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        ) : (
          <button
            onClick={onLoginClick}
            style={styles.btnAcc(hoveredBtn === 'login')}
            onMouseEnter={() => setHoveredBtn('login')}
            onMouseLeave={() => setHoveredBtn(null)}
            title="Entrar na conta"
          >
            <LogIn size={16} /> Entrar
          </button>
        )}
      </div>
    </header>
  );
};
