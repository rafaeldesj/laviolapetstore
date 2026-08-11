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
  windowWidth?: number;
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
  windowWidth = 1024,
}) => {
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const role = user?.profile?.role;

  const isMobile = windowWidth < 600;

  return (
    <header style={{ ...styles.siteHeader, position: 'relative' }} role="banner">
      {/* Logo */}
      <div style={styles.siteLogo}>
        <PawPrint style={styles.logoSvg} aria-hidden="true" />
        <h1 style={styles.logoTitle}>La Viola Petshop</h1>
      </div>

      {/* Auth area — compresses on mobile */}
      <div style={styles.authContainer}>
        {user ? (
          <div style={styles.userInfo}>
            {/* Avatar */}
            <div style={{
              ...styles.userAvatar,
              backgroundColor: role ? roleBadgeColors[role] + '22' : undefined,
              color: role ? roleBadgeColors[role] : styles.primary,
              border: `1px solid ${role ? roleBadgeColors[role] + '44' : styles.borderColor}`,
            }} aria-hidden="true">
              <User size={14} />
            </div>

            {/* Name + role — hidden on mobile */}
            {!isMobile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                <span style={styles.userName}>Olá, {user.name}</span>
                {role && (
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.5px',
                    color: roleBadgeColors[role], textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>
                    {roleLabels[role]}
                    {user?.profile?.collaborator_category?.name && (
                      <span style={{ fontWeight: 500, textTransform: 'none', opacity: 0.85 }}>
                        {' '}({user.profile.collaborator_category.name})
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* Role badge only on mobile */}
            {isMobile && role && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.4px',
                color: roleBadgeColors[role], textTransform: 'uppercase',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {roleLabels[role]}
              </span>
            )}

            {/* Logout button */}
            <button
              onClick={onLogout}
              style={styles.btnLogout(hoveredBtn === 'logout')}
              onMouseEnter={() => setHoveredBtn('logout')}
              onMouseLeave={() => setHoveredBtn(null)}
              title="Sair da conta"
            >
              <LogOut size={14} />
              {!isMobile && ' Sair'}
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
            <LogIn size={16} />
            {!isMobile && ' Entrar'}
          </button>
        )}
      </div>

      {/* Animacao de pets andando sobre a linha cinza */}
      <div className="header-pet-walk-container">
        <span className="header-pet-animated header-pet-dog">🐕</span>
        <span className="header-pet-animated header-pet-cat">🐈</span>
        <span className="header-pet-animated header-pet-rabbit">🐇</span>
      </div>
      <style>{`
        .header-pet-walk-container {
          position: absolute;
          bottom: -3px;
          left: 0;
          width: 100%;
          height: 28px;
          overflow: hidden;
          pointer-events: none;
          z-index: 10;
        }
        .header-pet-animated {
          position: absolute;
          bottom: 0px;
          left: -60px;
          font-size: 1.4rem;
          white-space: nowrap;
          line-height: 1;
        }
        .header-pet-dog {
          animation-name: header-dog-walk;
          animation-duration: 25s;
          animation-timing-function: linear;
          animation-delay: 2s;
          animation-iteration-count: infinite;
        }
        .header-pet-cat {
          animation-name: header-cat-walk;
          animation-duration: 28s;
          animation-timing-function: linear;
          animation-delay: 9s;
          animation-iteration-count: infinite;
        }
        .header-pet-rabbit {
          animation-name: header-rabbit-walk;
          animation-duration: 22s;
          animation-timing-function: linear;
          animation-delay: 16s;
          animation-iteration-count: infinite;
        }
        @keyframes header-dog-walk {
          0% { left: -50px; transform: scaleX(-1) translateY(0) rotate(0deg); }
          40% { left: 40%; transform: scaleX(-1) translateY(0) rotate(0deg); }
          42% { left: 40%; transform: scaleX(-1) translateY(2px) rotate(-10deg); }
          44% { left: 40%; transform: scaleX(-1) translateY(0px) rotate(10deg); }
          46% { left: 40%; transform: scaleX(-1) translateY(2px) rotate(-10deg); }
          48% { left: 40%; transform: scaleX(-1) translateY(0px) rotate(10deg); }
          50% { left: 40%; transform: scaleX(-1) translateY(2px) rotate(0deg); }
          55% { left: 40%; transform: scaleX(-1) translateY(0) rotate(0deg); }
          100% { left: 100%; transform: scaleX(-1) translateY(0) rotate(0deg); }
        }
        @keyframes header-cat-walk {
          0% { left: 100%; transform: scaleX(1) translateY(0) rotate(0deg); }
          35% { left: 55%; transform: scaleX(1) translateY(0) rotate(0deg); }
          38% { left: 55%; transform: scaleX(1) translateY(4px) rotate(90deg); }
          41% { left: 55%; transform: scaleX(1) translateY(8px) rotate(180deg); }
          44% { left: 55%; transform: scaleX(1) translateY(4px) rotate(270deg); }
          47% { left: 55%; transform: scaleX(1) translateY(8px) rotate(360deg); }
          50% { left: 55%; transform: scaleX(1) translateY(4px) rotate(450deg); }
          53% { left: 55%; transform: scaleX(1) translateY(0px) rotate(540deg); }
          55% { left: 55%; transform: scaleX(1) translateY(0px) rotate(720deg); }
          60% { left: 55%; transform: scaleX(1) translateY(0) rotate(0deg); }
          100% { left: -50px; transform: scaleX(1) translateY(0) rotate(0deg); }
        }
        @keyframes header-rabbit-walk {
          0% { left: -50px; transform: scaleX(-1) translateY(0); }
          5% { left: 10%; transform: scaleX(-1) translateY(-6px); }
          7% { left: 13%; transform: scaleX(-1) translateY(0); }
          12% { left: 23%; transform: scaleX(-1) translateY(-6px); }
          14% { left: 26%; transform: scaleX(-1) translateY(0); }
          19% { left: 36%; transform: scaleX(-1) translateY(-6px); }
          21% { left: 39%; transform: scaleX(-1) translateY(0); }
          26% { left: 49%; transform: scaleX(-1) translateY(-6px); }
          28% { left: 52%; transform: scaleX(-1) translateY(0); }
          30% { left: 52%; transform: scaleX(-1) translateY(0) scale(1.1); }
          35% { left: 52%; transform: scaleX(-1) translateY(0) scale(1.0); }
          40% { left: 52%; transform: scaleX(-1) translateY(0) scale(1.1); }
          45% { left: 52%; transform: scaleX(-1) translateY(0) scale(1.0); }
          50% { left: 52%; transform: scaleX(-1) translateY(0); }
          55% { left: 62%; transform: scaleX(-1) translateY(-6px); }
          57% { left: 65%; transform: scaleX(-1) translateY(0); }
          62% { left: 75%; transform: scaleX(-1) translateY(-6px); }
          64% { left: 78%; transform: scaleX(-1) translateY(0); }
          69% { left: 88%; transform: scaleX(-1) translateY(-6px); }
          71% { left: 91%; transform: scaleX(-1) translateY(0); }
          76% { left: 96%; transform: scaleX(-1) translateY(-6px); }
          78% { left: 99%; transform: scaleX(-1) translateY(0); }
          83% { left: 100%; transform: scaleX(-1) translateY(0); }
          100% { left: 100%; transform: scaleX(-1) translateY(0); }
        }
      `}</style>
    </header>
  );
};
