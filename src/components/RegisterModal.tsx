import React, { useState } from 'react';
import { X, UserPlus, Mail } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';

interface RegisterModalProps {
  onClose: () => void;
  onRegisterSuccess: (user: AuthUser) => void;
  onGoLogin: () => void;
  styles: any;
}

type Step = 'form' | 'otp';

export const RegisterModal: React.FC<RegisterModalProps> = ({
  onClose,
  onRegisterSuccess,
  onGoLogin,
  styles,
}) => {
  const [step, setStep] = useState<Step>('form');
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hoveredClose, setHoveredClose] = useState<boolean>(false);
  const [hoveredSubmit, setHoveredSubmit] = useState<boolean>(false);

  const validateGmail = (value: string): boolean =>
    /^[a-zA-Z0-9._%+\-]+@gmail\.com$/.test(value.trim());

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName || !email || !password || !username || !phone) {
      setErrorMsg('Preencha todos os campos obrigatórios.');
      return;
    }
    if (!validateGmail(email)) {
      setErrorMsg('Apenas endereços @gmail.com são aceitos para cadastro.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setIsLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              username: username.trim(),
              phone: phone.trim(),
            },
          },
        });
        if (error) throw error;
        setStep('otp');
      } else {
        const users = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
        const newUser: AuthUser = {
          id: Math.random().toString(36).substring(2, 9),
          email: email.trim(),
          name: fullName.trim(),
          profile: null,
        };
        users.push({ ...newUser, username: username.trim(), phone: phone.trim() });
        localStorage.setItem('laviola_mock_users', JSON.stringify(users));
        onRegisterSuccess(newUser);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!otpCode || otpCode.length < 6) {
      setErrorMsg('Digite o código de 6 dígitos enviado ao seu e-mail.');
      return;
    }
    setIsLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otpCode.trim(),
          type: 'signup',
        });
        if (error) throw error;
        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*, collaborator_category:collaborator_categories(id, name, description, is_active)')
            .eq('id', data.user.id)
            .single();
          onRegisterSuccess({
            id: data.user.id,
            email: data.user.email || email,
            name: profile?.full_name || fullName,
            profile: profile || null,
          });
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Código inválido ou expirado. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="register-modal-title">
        <div style={styles.modalHeader}>
          <h2 id="register-modal-title" style={styles.modalTitle}>
            {step === 'form' ? 'Criar Conta' : 'Confirmar E-mail'}
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
          <p style={{ color: 'red', fontSize: '0.9rem', margin: '0' }}>{errorMsg}</p>
        )}

        {step === 'form' ? (
          <form onSubmit={handleRegister} style={styles.modalForm}>
            <div style={styles.formGroup}>
              <label htmlFor="reg-name" style={styles.formLabel}>Nome Completo *</label>
              <input id="reg-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                style={styles.formInput} placeholder="Seu nome completo" disabled={isLoading} />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="reg-email" style={styles.formLabel}>
                Gmail * <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#999' }}>(somente @gmail.com)</span>
              </label>
              <input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                style={styles.formInput} placeholder="seunome@gmail.com" disabled={isLoading} />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="reg-username" style={styles.formLabel}>Username (login) *</label>
              <input id="reg-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                style={styles.formInput} placeholder="Seu nome de usuário único" disabled={isLoading} />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="reg-phone" style={styles.formLabel}>Celular *</label>
              <input id="reg-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                style={styles.formInput} placeholder="(21) 99999-9999" disabled={isLoading} />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="reg-password" style={styles.formLabel}>Senha *</label>
              <input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                style={styles.formInput} placeholder="Mínimo 6 caracteres" disabled={isLoading} autoComplete="new-password" />
            </div>

            <button type="submit" disabled={isLoading}
              style={styles.formSubmitBtn(hoveredSubmit)}
              onMouseEnter={() => setHoveredSubmit(true)}
              onMouseLeave={() => setHoveredSubmit(false)}>
              <UserPlus size={16} style={{ marginRight: '6px' }} />
              {isLoading ? 'Enviando...' : 'Criar Conta'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={styles.modalForm}>
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <Mail size={40} style={{ color: styles.primary, marginBottom: '10px' }} />
              <p style={{ fontSize: '0.95rem', color: styles.sidebarWidgetText?.color }}>
                Enviamos um código de confirmação para <strong>{email}</strong>. 
                Verifique sua caixa de entrada e cole o código abaixo.
              </p>
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="reg-otp" style={styles.formLabel}>Código de Confirmação</label>
              <input id="reg-otp" type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)}
                style={{ ...styles.formInput, textAlign: 'center', letterSpacing: '0.4rem', fontSize: '1.4rem' }}
                placeholder="000000" maxLength={6} disabled={isLoading} autoComplete="one-time-code" />
            </div>

            <button type="submit" disabled={isLoading}
              style={styles.formSubmitBtn(hoveredSubmit)}
              onMouseEnter={() => setHoveredSubmit(true)}
              onMouseLeave={() => setHoveredSubmit(false)}>
              {isLoading ? 'Verificando...' : 'Confirmar e Entrar'}
            </button>

            <button type="button" onClick={() => setStep('form')} style={styles.modalSwitchBtn}>
              ← Voltar e corrigir dados
            </button>
          </form>
        )}

        {step === 'form' && (
          <p style={styles.modalSwitchText}>
            Já tem conta?
            <button onClick={onGoLogin} style={styles.modalSwitchBtn}>Fazer Login</button>
          </p>
        )}
      </div>
    </div>
  );
};
