import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';

interface LoginModalProps {
  onClose: () => void;
  onLoginSuccess: (user: { id: string; email: string; name: string }) => void;
  styles: any;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onClose,
  onLoginSuccess,
  styles,
}) => {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [hoveredClose, setHoveredClose] = useState<boolean>(false);
  const [hoveredSubmit, setHoveredSubmit] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    if (!email || !password || (isSignUp && !name)) {
      setErrorMsg('Por favor, preencha todos os campos.');
      setIsLoading(false);
      return;
    }

    try {
      if (isSupabaseConfigured && supabase) {
        if (isSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: name,
              },
            },
          });

          if (error) throw error;
          
          if (data.user) {
            onLoginSuccess({
              id: data.user.id,
              email: data.user.email || email,
              name: name,
            });
            onClose();
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) throw error;

          if (data.user) {
            onLoginSuccess({
              id: data.user.id,
              email: data.user.email || email,
              name: data.user.user_metadata?.full_name || email.split('@')[0],
            });
            onClose();
          }
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 800));
        
        if (isSignUp) {
          const mockUser = {
            id: Math.random().toString(36).substring(2, 9),
            email,
            name,
          };
          
          const users = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
          users.push(mockUser);
          localStorage.setItem('laviola_mock_users', JSON.stringify(users));
          
          onLoginSuccess(mockUser);
        } else {
          const users = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
          const found = users.find((u: any) => u.email === email);
          
          const loggedUser = found || {
            id: 'mock-user-123',
            email,
            name: email.split('@')[0],
          };
          
          onLoginSuccess(loggedUser);
        }
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocorreu um erro ao processar sua solicitação.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div style={styles.modalHeader}>
          <h2 id="modal-title" style={styles.modalTitle}>
            {isSignUp ? 'Criar Conta' : 'Entrar na Conta'}
          </h2>
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
          <div style={{ color: 'red', fontSize: '0.9rem', marginBottom: '10px' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          {isSignUp && (
            <div style={styles.formGroup}>
              <label htmlFor="auth-name" style={styles.formLabel}>Nome Completo</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.formInput}
                placeholder="Seu nome"
                disabled={isLoading}
              />
            </div>
          )}

          <div style={styles.formGroup}>
            <label htmlFor="auth-email" style={styles.formLabel}>E-mail</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.formInput}
              placeholder="seuemail@exemplo.com"
              disabled={isLoading}
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="auth-password" style={styles.formLabel}>Senha</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.formInput}
              placeholder="Digite sua senha"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={styles.formSubmitBtn(hoveredSubmit)}
            onMouseEnter={() => setHoveredSubmit(true)}
            onMouseLeave={() => setHoveredSubmit(false)}
          >
            {isLoading ? 'Carregando...' : (isSignUp ? 'Registrar' : 'Entrar')}
          </button>
        </form>

        <p style={styles.modalSwitchText}>
          {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
            }}
            style={styles.modalSwitchBtn}
          >
            {isSignUp ? 'Fazer Login' : 'Cadastre-se'}
          </button>
        </p>
      </div>
    </div>
  );
};
