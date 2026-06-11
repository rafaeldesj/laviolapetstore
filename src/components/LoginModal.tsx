import React, { useState } from 'react';
import { X, LogIn } from 'lucide-react';
import { supabase, isSupabaseConfigured, lookupEmailByIdentifier } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';

interface LoginModalProps {
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
  onGoRegister: () => void;
  styles: any;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onClose,
  onLoginSuccess,
  onGoRegister,
  styles,
}) => {
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
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
      if (isSupabaseConfigured && supabase) {
        const email = await lookupEmailByIdentifier(identifier.trim());
        if (!email) {
          setErrorMsg('Nenhum usuário encontrado com esse e-mail, username ou celular.');
          setIsLoading(false);
          return;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*, collaborator_category:collaborator_categories(id, name, description, is_active)')
            .eq('id', data.user.id)
            .single();
          onLoginSuccess({
            id: data.user.id,
            email: data.user.email || email,
            name: profile?.full_name || email.split('@')[0],
            profile: profile || null,
          });
          onClose();
        }
      } else {
        const users = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
        const found = users.find((u: any) =>
          u.email === identifier || u.username === identifier || u.phone === identifier
        );
        const mockUser: AuthUser = found
          ? { id: found.id, email: found.email, name: found.name, profile: null }
          : { id: 'mock-user-123', email: identifier, name: identifier.split('@')[0], profile: null };
        onLoginSuccess(mockUser);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao fazer login. Verifique seus dados.');
    } finally {
      setIsLoading(false);
    }
  };

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
          <p style={{ color: 'red', fontSize: '0.9rem', margin: '0' }}>{errorMsg}</p>
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
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.formInput}
              placeholder="Sua senha"
              disabled={isLoading}
              autoComplete="current-password"
            />
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
