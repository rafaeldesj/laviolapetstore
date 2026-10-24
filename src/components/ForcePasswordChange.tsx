import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, LogOut } from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseClient';
import type { AuthUser } from '../hooks/useAuth';

interface Props {
  styles: any;
  user: AuthUser;
  /** Chamado depois de trocar a senha com sucesso, para liberar o uso normal do sistema. */
  onDone: () => void;
  onLogout: () => void;
}

const friendly: Record<string, string> = {
  'auth/wrong-password': 'A senha atual está errada.',
  'auth/invalid-credential': 'A senha atual está errada.',
  'auth/too-many-requests': 'Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.',
  'auth/weak-password': 'A nova senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem conexão com a internet. Tente de novo.',
};

/**
 * Tela obrigatória de troca de senha, exibida no primeiro login de uma conta cujo senha foi definida por
 * outra pessoa (equipe criando um cliente ou outro usuário). Bloqueia o resto do sistema até a troca ser feita.
 */
export const ForcePasswordChange: React.FC<Props> = ({ styles, user, onDone, onLogout }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg('Preencha a senha atual e a nova senha (duas vezes).');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('A nova senha não é igual nas duas vezes que foi digitada.');
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMsg('A nova senha precisa ser diferente da senha atual.');
      return;
    }

    setIsSaving(true);
    try {
      if (!auth?.currentUser || !db) throw new Error('Sessão inválida. Saia e entre de novo.');
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      await updateDoc(doc(db, 'profiles', user.id), { must_change_password: false });
      onDone();
    } catch (err: any) {
      setErrorMsg(friendly[err?.code] || err?.message || 'Não foi possível trocar a senha. Tente de novo.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ ...styles.modalOverlay, position: 'fixed' }}>
      <div style={{ ...styles.modalContent, maxWidth: '420px' }} role="dialog" aria-modal="true" aria-labelledby="force-pwd-title">
        <div style={styles.modalHeader}>
          <h2 id="force-pwd-title" style={styles.modalTitle}>
            <KeyRound size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Troque sua senha
          </h2>
        </div>

        <p style={{ margin: 0, fontSize: '0.88rem', color: styles.sidebarWidgetText?.color }}>
          Essa senha foi definida por outra pessoa para você começar a usar o sistema. Antes de continuar, escolha uma senha só sua.
        </p>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          <div style={styles.formGroup}>
            <label htmlFor="fpc-current" style={styles.formLabel}>Senha atual *</label>
            <input
              id="fpc-current"
              type={show ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={styles.formInput}
              autoComplete="current-password"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="fpc-new" style={styles.formLabel}>Nova senha *</label>
            <input
              id="fpc-new"
              type={show ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={styles.formInput}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="fpc-confirm" style={styles.formLabel}>Digite a nova senha de novo *</label>
            <input
              id="fpc-confirm"
              type={show ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={styles.formInput}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: styles.textMain, cursor: 'pointer' }}>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            {show ? <EyeOff size={14} /> : <Eye size={14} />} Mostrar as senhas
          </label>

          {errorMsg && (
            <div role="alert" style={{ color: 'hsl(0,75%,55%)', fontSize: '0.85rem', padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)', borderRadius: '6px', border: '1px solid hsl(0,75%,55%,0.25)' }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-save"
              style={{ ...styles.formSubmitBtn(false), flexGrow: 1, margin: 0, opacity: isSaving ? 0.7 : 1 }}
            >
              {isSaving ? 'Salvando...' : 'Trocar senha e entrar'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Sair"
              aria-label="Sair sem trocar a senha"
              style={{ ...styles.btnAcc(false), padding: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
