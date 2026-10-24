import React, { useState } from 'react';
import { UserCog, KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile as updateAuthProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseClient';
import type { AuthUser } from '../hooks/useAuth';
import { checkPhoneExists, checkUsernameExists } from '../utils/userValidation';
import { formatPhoneBR } from '../utils/formatters';

interface Props {
  styles: any;
  currentUser: AuthUser;
  /** Atualiza o usuário em memória (nome no cabeçalho etc.) depois de salvar, sem precisar logar de novo. */
  onProfileUpdated: (user: AuthUser) => void;
}

const pwdErrors: Record<string, string> = {
  'auth/wrong-password': 'A senha atual está errada.',
  'auth/invalid-credential': 'A senha atual está errada.',
  'auth/too-many-requests': 'Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.',
  'auth/weak-password': 'A nova senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem conexão com a internet. Tente de novo.',
};

/** Tela "Minha Conta": qualquer pessoa logada troca o próprio nome, apelido, celular e senha — sem depender da equipe. */
export const MinhaConta: React.FC<Props> = ({ styles, currentUser, onProfileUpdated }) => {
  const [fullName, setFullName] = useState(currentUser.profile?.full_name || currentUser.name || '');
  const [username, setUsername] = useState(currentUser.profile?.username || '');
  const [phone, setPhone] = useState(currentUser.profile?.phone || '');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSaved, setPwdSaved] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);

    const name = fullName.trim();
    const user = username.trim();
    const tel = phone.trim();
    if (!name || !user) {
      setProfileError('Nome e apelido (login) são obrigatórios.');
      return;
    }

    setSavingProfile(true);
    try {
      if (user !== (currentUser.profile?.username || '') && await checkUsernameExists(user, currentUser.id)) {
        setProfileError('Este apelido já está em uso. Escolha outro.');
        return;
      }
      if (tel && tel !== (currentUser.profile?.phone || '') && await checkPhoneExists(tel, currentUser.id)) {
        setProfileError('Este celular já está cadastrado em outra conta.');
        return;
      }
      if (!db) throw new Error('Serviço indisponível no momento.');
      await updateDoc(doc(db, 'profiles', currentUser.id), { full_name: name, username: user, phone: tel });
      if (auth?.currentUser) await updateAuthProfile(auth.currentUser, { displayName: name }).catch(() => {});

      onProfileUpdated({
        ...currentUser,
        name,
        profile: currentUser.profile ? { ...currentUser.profile, full_name: name, username: user, phone: tel } : currentUser.profile,
      });
      setProfileSaved(true);
    } catch (err: any) {
      setProfileError(err.message || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSaved(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwdError('Preencha a senha atual e a nova senha (duas vezes).');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('A nova senha não é igual nas duas vezes que foi digitada.');
      return;
    }
    if (newPassword === currentPassword) {
      setPwdError('A nova senha precisa ser diferente da senha atual.');
      return;
    }

    setSavingPwd(true);
    try {
      if (!auth?.currentUser) throw new Error('Sessão inválida. Saia e entre de novo.');
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdSaved(true);
    } catch (err: any) {
      setPwdError(pwdErrors[err?.code] || err?.message || 'Não foi possível trocar a senha. Tente de novo.');
    } finally {
      setSavingPwd(false);
    }
  };

  const card: React.CSSProperties = {
    backgroundColor: styles.cardBackground || styles.background,
    border: `1px solid ${styles.borderColor}`,
    borderRadius: '14px',
    padding: '20px',
    boxShadow: styles.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  };
  const okBox: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(142,60%,28%)', backgroundColor: 'hsl(142,60%,45%,0.1)', border: '1px solid hsl(142,60%,40%,0.3)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 600 };
  const errBox: React.CSSProperties = { color: 'hsl(0,75%,45%)', fontSize: '0.85rem', padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)', borderRadius: '8px', border: '1px solid hsl(0,75%,55%,0.25)' };

  return (
    <section style={styles.contentSection} aria-labelledby="minha-conta-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="minha-conta-heading" style={styles.sectionTitle}>
            <UserCog size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Minha Conta
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Troque seus dados de cadastro e sua senha. Ninguém mais precisa fazer isso por você.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
        <form onSubmit={handleSaveProfile} style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: styles.textMain }}>Meus dados</h3>

          <div style={styles.formGroup}>
            <label htmlFor="mc-name" style={styles.formLabel}>Nome completo *</label>
            <input id="mc-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} style={styles.formInput} required />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="mc-email" style={styles.formLabel}>E-mail</label>
            <input id="mc-email" type="email" value={currentUser.email} disabled style={{ ...styles.formInput, opacity: 0.6, cursor: 'not-allowed' }} />
            <span style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color }}>Para trocar o e-mail, fale com quem administra o sistema.</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '15px' }}>
            <div style={styles.formGroup}>
              <label htmlFor="mc-username" style={styles.formLabel}>Apelido (login) *</label>
              <input id="mc-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={styles.formInput} required />
            </div>
            <div style={styles.formGroup}>
              <label htmlFor="mc-phone" style={styles.formLabel}>Celular</label>
              <input id="mc-phone" type="tel" value={phone} onChange={(e) => setPhone(formatPhoneBR(e.target.value))} placeholder="(21) 99999-9999" style={styles.formInput} />
            </div>
          </div>

          {profileError && <div role="alert" style={errBox}>{profileError}</div>}
          {profileSaved && <div role="status" style={okBox}><CheckCircle2 size={16} /> Dados atualizados.</div>}

          <button type="submit" disabled={savingProfile} className="btn-save" style={{ ...styles.formSubmitBtn(false), margin: 0, opacity: savingProfile ? 0.7 : 1 }}>
            {savingProfile ? 'Salvando...' : 'Salvar dados'}
          </button>
        </form>

        <form onSubmit={handleChangePassword} style={card}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: styles.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyRound size={16} style={{ color: styles.primary }} /> Trocar senha
          </h3>

          <div style={styles.formGroup}>
            <label htmlFor="mc-current-pwd" style={styles.formLabel}>Senha atual *</label>
            <input id="mc-current-pwd" type={showPwd ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" style={styles.formInput} required />
          </div>
          <div style={styles.formGroup}>
            <label htmlFor="mc-new-pwd" style={styles.formLabel}>Nova senha *</label>
            <input id="mc-new-pwd" type={showPwd ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={6} style={styles.formInput} required />
          </div>
          <div style={styles.formGroup}>
            <label htmlFor="mc-confirm-pwd" style={styles.formLabel}>Digite a nova senha de novo *</label>
            <input id="mc-confirm-pwd" type={showPwd ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={6} style={styles.formInput} required />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: styles.textMain, cursor: 'pointer' }}>
            <input type="checkbox" checked={showPwd} onChange={(e) => setShowPwd(e.target.checked)} />
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />} Mostrar as senhas
          </label>

          {pwdError && <div role="alert" style={errBox}>{pwdError}</div>}
          {pwdSaved && <div role="status" style={okBox}><CheckCircle2 size={16} /> Senha trocada com sucesso.</div>}

          <button type="submit" disabled={savingPwd} className="btn-save" style={{ ...styles.formSubmitBtn(false), margin: 0, opacity: savingPwd ? 0.7 : 1 }}>
            {savingPwd ? 'Salvando...' : 'Trocar senha'}
          </button>
        </form>
      </div>
    </section>
  );
};
