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
  accountant: 'hsl(190, 70%, 40%)',
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
      <div className="header-pet-walk-container" aria-hidden="true">
        <span className="header-pet-lane header-pet-lane-dog"><span className="header-pet-animated header-pet-dog">🐕</span></span>
        <span className="header-pet-lane header-pet-lane-cat"><span className="header-pet-animated header-pet-cat">🐈</span></span>
        <span className="header-pet-lane header-pet-lane-rabbit"><span className="header-pet-animated header-pet-rabbit">🐇</span></span>
      </div>
      <style>{`
        /* Os bichinhos andam só com 'transform' (o navegador anima sem refazer o layout da página).
           Antes animavam 'left', o que recalculava a página inteira 60 vezes por segundo. */
        .header-pet-walk-container {
          position: absolute;
          bottom: -3px;
          left: 0;
          width: 100%;
          height: 28px;
          overflow: hidden;
          pointer-events: none;
          z-index: 10;
          contain: layout paint;
        }
        .header-pet-lane {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 28px;
          will-change: transform;
        }
        .header-pet-animated {
          position: absolute;
          bottom: 0px;
          left: 0;
          font-size: 1.4rem;
          white-space: nowrap;
          line-height: 1;
          will-change: transform;
        }
        .header-pet-lane-dog, .header-pet-dog { animation-duration: 25s; animation-delay: 2s; }
        .header-pet-lane-cat, .header-pet-cat { animation-duration: 28s; animation-delay: 9s; }
        .header-pet-lane-rabbit, .header-pet-rabbit { animation-duration: 22s; animation-delay: 16s; }
        .header-pet-lane, .header-pet-animated { animation-timing-function: linear; animation-iteration-count: infinite; }
        .header-pet-lane-dog { animation-name: header-dog-lane; }
        .header-pet-dog { animation-name: header-dog-wiggle; }
        .header-pet-lane-cat { animation-name: header-cat-lane; }
        .header-pet-cat { animation-name: header-cat-wiggle; }
        .header-pet-lane-rabbit { animation-name: header-rabbit-lane; }
        .header-pet-rabbit { animation-name: header-rabbit-wiggle; }
        @media (prefers-reduced-motion: reduce) {
          .header-pet-walk-container { display: none; }
        }
        @keyframes header-dog-lane {
          0% { transform: translateX(-50px); }
          40% { transform: translateX(40%); }
          42% { transform: translateX(40%); }
          44% { transform: translateX(40%); }
          46% { transform: translateX(40%); }
          48% { transform: translateX(40%); }
          50% { transform: translateX(40%); }
          55% { transform: translateX(40%); }
          100% { transform: translateX(100%); }
        }
        @keyframes header-dog-wiggle {
          0% { transform: scaleX(-1) translateY(0) rotate(0deg); }
          40% { transform: scaleX(-1) translateY(0) rotate(0deg); }
          42% { transform: scaleX(-1) translateY(2px) rotate(-10deg); }
          44% { transform: scaleX(-1) translateY(0px) rotate(10deg); }
          46% { transform: scaleX(-1) translateY(2px) rotate(-10deg); }
          48% { transform: scaleX(-1) translateY(0px) rotate(10deg); }
          50% { transform: scaleX(-1) translateY(2px) rotate(0deg); }
          55% { transform: scaleX(-1) translateY(0) rotate(0deg); }
          100% { transform: scaleX(-1) translateY(0) rotate(0deg); }
        }
        @keyframes header-cat-lane {
          0% { transform: translateX(100%); }
          35% { transform: translateX(55%); }
          38% { transform: translateX(55%); }
          41% { transform: translateX(55%); }
          44% { transform: translateX(55%); }
          47% { transform: translateX(55%); }
          50% { transform: translateX(55%); }
          53% { transform: translateX(55%); }
          55% { transform: translateX(55%); }
          60% { transform: translateX(55%); }
          100% { transform: translateX(-50px); }
        }
        @keyframes header-cat-wiggle {
          0% { transform: scaleX(1) translateY(0) rotate(0deg); }
          35% { transform: scaleX(1) translateY(0) rotate(0deg); }
          38% { transform: scaleX(1) translateY(4px) rotate(90deg); }
          41% { transform: scaleX(1) translateY(8px) rotate(180deg); }
          44% { transform: scaleX(1) translateY(4px) rotate(270deg); }
          47% { transform: scaleX(1) translateY(8px) rotate(360deg); }
          50% { transform: scaleX(1) translateY(4px) rotate(450deg); }
          53% { transform: scaleX(1) translateY(0px) rotate(540deg); }
          55% { transform: scaleX(1) translateY(0px) rotate(720deg); }
          60% { transform: scaleX(1) translateY(0) rotate(0deg); }
          100% { transform: scaleX(1) translateY(0) rotate(0deg); }
        }
        @keyframes header-rabbit-lane {
          0% { transform: translateX(-50px); }
          5% { transform: translateX(10%); }
          7% { transform: translateX(13%); }
          12% { transform: translateX(23%); }
          14% { transform: translateX(26%); }
          19% { transform: translateX(36%); }
          21% { transform: translateX(39%); }
          26% { transform: translateX(49%); }
          28% { transform: translateX(52%); }
          30% { transform: translateX(52%); }
          35% { transform: translateX(52%); }
          40% { transform: translateX(52%); }
          45% { transform: translateX(52%); }
          50% { transform: translateX(52%); }
          55% { transform: translateX(62%); }
          57% { transform: translateX(65%); }
          62% { transform: translateX(75%); }
          64% { transform: translateX(78%); }
          69% { transform: translateX(88%); }
          71% { transform: translateX(91%); }
          76% { transform: translateX(96%); }
          78% { transform: translateX(99%); }
          83% { transform: translateX(100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes header-rabbit-wiggle {
          0% { transform: scaleX(-1) translateY(0); }
          5% { transform: scaleX(-1) translateY(-6px); }
          7% { transform: scaleX(-1) translateY(0); }
          12% { transform: scaleX(-1) translateY(-6px); }
          14% { transform: scaleX(-1) translateY(0); }
          19% { transform: scaleX(-1) translateY(-6px); }
          21% { transform: scaleX(-1) translateY(0); }
          26% { transform: scaleX(-1) translateY(-6px); }
          28% { transform: scaleX(-1) translateY(0); }
          30% { transform: scaleX(-1) translateY(0) scale(1.1); }
          35% { transform: scaleX(-1) translateY(0) scale(1.0); }
          40% { transform: scaleX(-1) translateY(0) scale(1.1); }
          45% { transform: scaleX(-1) translateY(0) scale(1.0); }
          50% { transform: scaleX(-1) translateY(0); }
          55% { transform: scaleX(-1) translateY(-6px); }
          57% { transform: scaleX(-1) translateY(0); }
          62% { transform: scaleX(-1) translateY(-6px); }
          64% { transform: scaleX(-1) translateY(0); }
          69% { transform: scaleX(-1) translateY(-6px); }
          71% { transform: scaleX(-1) translateY(0); }
          76% { transform: scaleX(-1) translateY(-6px); }
          78% { transform: scaleX(-1) translateY(0); }
          83% { transform: scaleX(-1) translateY(0); }
          100% { transform: scaleX(-1) translateY(0); }
        }
      `}</style>
    </header>
  );
};
