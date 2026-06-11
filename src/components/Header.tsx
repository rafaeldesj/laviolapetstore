import React, { useState } from 'react';
import { PawPrint, LogIn, LogOut, User } from 'lucide-react';

interface HeaderProps {
  user: { name: string } | null;
  onLoginClick: () => void;
  onLogout: () => void;
  styles: any;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLoginClick,
  onLogout,
  styles,
}) => {
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  return (
    <header style={styles.siteHeader} role="banner">
      <div style={styles.siteLogo}>
        <PawPrint style={styles.logoSvg} aria-hidden="true" />
        <h1 style={styles.logoTitle}>La Viola Petshop</h1>
      </div>

      <div style={styles.authContainer}>
        {user ? (
          <div style={styles.userInfo}>
            <div style={styles.userAvatar} aria-hidden="true">
              <User size={16} />
            </div>
            <span style={styles.userName}>Olá, {user.name}</span>
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

