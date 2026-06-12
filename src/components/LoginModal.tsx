import React, { useState } from 'react';
import { X, LogIn, Eye, EyeOff } from 'lucide-react';
import type { AuthUser } from '../hooks/useAuth';

interface LoginModalProps {
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
  onGoRegister: () => void;
  styles: any;
  /** login function from useAuth – handles both Supabase and mock paths */
  login: (identifier: string, password: string) => Promise<void>;
  user: AuthUser | null;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onClose,
  onLoginSuccess,
  onGoRegister,
  styles,
  login,
  user,
}) => {
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hoveredClose, setHoveredClose] = useState<boolean>(false);
  const [hoveredSubmit, setHoveredSubmit] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!identifier || !password) {
      setErrorMsg('Preencha o identificador e a senha.');
      return;
    }
    setIsLoading(true);
    try {
      await login(identifier.trim(), password);
      // After login, useAuth updates `user`. We read that via the prop after state settles.
      // onLoginSuccess will be called by the parent once user changes.
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao fazer login. Verifique seus dados.');
    } finally {
      setIsLoading(false);
    }
  };

  // When the parent detects user changed (logged in), it can close this modal.
  // We trigger onLoginSuccess + onClose when user is set after login.
  React.useEffect(() => {
    if (user) {
      onLoginSuccess(user);
      onClose();
    }
  }, [user]);

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
        <div style={styles.modalHeader}>
          <h2 id="login-modal-title" style={styles.modalTitle}>Entrar na Conta</h2>
          <button
            onClick={onClose}
            style={styles.modalCloseBtn(hoveredClose)}
            onMouseEnter={() => setHoveredClose(true)}
            onMouseLeave={() => setHoveredClose(false)}
            aria-label="Fechar modal"
          >
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <p style={{ color: 'hsl(0,75%,55%)', fontSize: '0.9rem', margin: '0', padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)', borderRadius: '6px', border: '1px solid hsl(0,75%,55%,0.25)' }}>{errorMsg}</p>
        )}

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          <div style={styles.formGroup}>
            <label htmlFor="login-identifier" style={styles.formLabel}>
              E-mail, Username ou Celular
            </label>
            <input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              style={styles.formInput}
              placeholder="Seu e-mail, username ou celular"
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="login-password" style={styles.formLabel}>Senha</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...styles.formInput, width: '100%', paddingRight: '40px' }}
                placeholder="Sua senha"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: styles.sidebarWidgetText?.color || '#999',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
                title={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={styles.formSubmitBtn(hoveredSubmit)}
            onMouseEnter={() => setHoveredSubmit(true)}
            onMouseLeave={() => setHoveredSubmit(false)}
          >
            <LogIn size={16} style={{ marginRight: '6px' }} />
            {isLoading ? 'Carregando...' : 'Entrar'}
          </button>
        </form>

        <p style={styles.modalSwitchText}>
          Não tem conta?
          <button onClick={onGoRegister} style={styles.modalSwitchBtn}>
            Cadastre-se
          </button>
        </p>
      </div>
    </div>
  );
};
