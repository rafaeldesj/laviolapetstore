import React, { useState } from 'react';
import { X, UserPlus, Eye, EyeOff } from 'lucide-react';
import { logAction } from '../supabaseClient';
import { auth, db, isFirebaseConfigured } from '../firebaseClient';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { formatPhoneBR } from '../utils/formatters';
import { doc, setDoc } from 'firebase/firestore';
import type { AuthUser } from '../hooks/useAuth';

interface RegisterModalProps {
  onClose: () => void;
  onRegisterSuccess: (user: AuthUser) => void;
  onGoLogin: () => void;
  styles: any;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({
  onClose,
  onRegisterSuccess,
  onGoLogin,
  styles,
}) => {
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
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
      if (isFirebaseConfigured && auth && db) {
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: fullName.trim() });
        
        const timestamp = new Date().toISOString();
        const profileData = {
          id: user.uid,
          email: user.email,
          full_name: fullName.trim(),
          username: username.trim(),
          phone: phone.trim(),
          role: 'client',
          is_active: true,
          created_at: timestamp,
          collaborator_category_id: null as string | null
        };
        
        // Wait 1.5s to ensure the auth token propagates to the Firestore client before writing
        await new Promise(resolve => setTimeout(resolve, 1500));
        await setDoc(doc(db, 'profiles', user.uid), profileData);

        const registeredUser: AuthUser = {
          id: user.uid,
          email: user.email || email,
          name: fullName.trim(),
          profile: profileData as any,
        };

        if (registeredUser.profile?.role !== 'developer') {
          await logAction(
            registeredUser.email,
            registeredUser.name,
            'Login',
            `O usuário "${registeredUser.name}" entrou no sistema (cadastro realizado).`
          );
        }

        onRegisterSuccess(registeredUser);
        onClose();
      } else {
        // Fallback for mock local usage
        const newId = Math.random().toString(36).substring(2, 9);
        const users = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
        const newProfile = {
          id: newId,
          email: email.trim(),
          full_name: fullName.trim(),
          username: username.trim(),
          phone: phone.trim(),
          role: 'client' as const,
          // @ts-ignore

          collaborator_category_id: (null as unknown as string),
          is_active: true,
          created_at: new Date().toISOString(),
        };
        const newUser: AuthUser = {
          id: newId,
          email: email.trim(),
          name: fullName.trim(),
          profile: newProfile,
        };
        // Remove redeclaration
        users.push({
          id: newId,
          email: email.trim(),
          name: fullName.trim(),
          username: username.trim(),
          phone: phone.trim(),
          password: password,
          profile: newProfile,
        });
        localStorage.setItem('laviola_mock_users', JSON.stringify(users));

        if (newUser.profile?.role !== 'developer') {
          await logAction(
            newUser.email,
            newUser.name,
            'Login',
            `O usuário "${newUser.name}" entrou no sistema (cadastro realizado).`
          );
        }

        onRegisterSuccess(newUser);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="register-modal-title">
        <div style={styles.modalHeader}>
          <h2 id="register-modal-title" style={styles.modalTitle}>Criar Conta</h2>
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
            <input id="reg-phone" type="tel" value={phone} onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
              style={styles.formInput} placeholder="(21) 99999-9999" disabled={isLoading} />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="reg-password" style={styles.formLabel}>Senha *</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...styles.formInput, width: '100%', paddingRight: '40px' }}
                placeholder="Mínimo 6 caracteres"
                disabled={isLoading}
                autoComplete="new-password"
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
                  padding: 0,
                }}
                title={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading}
            className="btn-save"
            style={styles.formSubmitBtn(hoveredSubmit)}
            onMouseEnter={() => setHoveredSubmit(true)}
            onMouseLeave={() => setHoveredSubmit(false)}>
            <UserPlus size={16} style={{ marginRight: '6px' }} />
            {isLoading ? 'Enviando...' : 'Criar Conta'}
          </button>
        </form>

        <p style={styles.modalSwitchText}>
          Já tem conta?
          <button onClick={onGoLogin} style={styles.modalSwitchBtn}>Fazer Login</button>
        </p>
      </div>
    </div>
  );
};
