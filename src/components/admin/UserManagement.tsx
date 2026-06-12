import React, { useState, useEffect, useCallback } from 'react';
import { Users, Shield, UserCheck, UserX, Search, Edit, Phone, Save, X, ChevronDown, PlusCircle } from 'lucide-react';
import type { UserProfile, UserRole } from '../../supabaseClient';
import { supabase, roleLabels, canManage, roleHierarchy, isSupabaseConfigured } from '../../supabaseClient';
import { PermissionsPanel } from './PermissionsPanel';
import type { AuthUser } from '../../hooks/useAuth';

interface UserManagementProps {
  currentUser: AuthUser;
  styles: any;
}

const roleBadgeColors: Record<UserRole, string> = {
  developer: 'hsl(280, 70%, 55%)',
  owner: 'hsl(36, 95%, 50%)',
  manager: 'hsl(210, 85%, 45%)',
  collaborator: 'hsl(142, 60%, 45%)',
};

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser, styles }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Inline edit form state
  const [editFullName, setEditFullName] = useState<string>('');
  const [editUsername, setEditUsername] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('collaborator');
  const [isSaving, setIsSaving] = useState(false);

  // Create user form state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newFullName, setNewFullName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newRole, setNewRole] = useState<UserRole>('collaborator');
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');

  const actorRole = currentUser.profile?.role || 'collaborator';

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (!supabase) {
        const mockUsers = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
        const profiles = mockUsers.map((u: any) => u.profile).filter(Boolean);
        setUsers(profiles);
      } else {
        const { data, error } = await supabase
          .from('profiles')
          .select(`*, collaborator_category:collaborator_categories(id, name, description, is_active)`)
          .order('role')
          .order('full_name');
        if (error) throw error;
        setUsers(data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar usuários.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleActive = async (user: UserProfile) => {
    try {
      if (!supabase) {
        const mockUsers = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
        const idx = mockUsers.findIndex((u: any) => u.id === user.id);
        if (idx !== -1 && mockUsers[idx].profile) {
          mockUsers[idx].profile.is_active = !mockUsers[idx].profile.is_active;
          localStorage.setItem('laviola_mock_users', JSON.stringify(mockUsers));
        }
      } else {
        const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
        if (error) throw error;
      }
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alternar status.');
    }
  };

  const startEdit = (user: UserProfile) => {
    setEditingId(user.id);
    setEditFullName(user.full_name);
    setEditUsername(user.username || '');
    setEditPhone(user.phone || '');
    setEditRole(user.role);
    setErrorMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setErrorMsg(null);
  };

  const handleUpdateUser = async (e: React.FormEvent, user: UserProfile) => {
    e.preventDefault();
    if (!editFullName.trim() || !editUsername.trim()) {
      setErrorMsg('Nome e Username são obrigatórios.');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    const updatedData = {
      full_name: editFullName.trim(),
      username: editUsername.trim(),
      phone: editPhone.trim(),
      role: editRole,
    };
    try {
      if (!supabase) {
        const mockUsers = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
        const idx = mockUsers.findIndex((u: any) => u.id === user.id);
        if (idx !== -1) {
          mockUsers[idx].name = updatedData.full_name;
          mockUsers[idx].username = updatedData.username;
          mockUsers[idx].phone = updatedData.phone;
          if (mockUsers[idx].profile) {
            Object.assign(mockUsers[idx].profile, updatedData);
          }
          localStorage.setItem('laviola_mock_users', JSON.stringify(mockUsers));
        }
      } else {
        const { error } = await supabase.from('profiles').update(updatedData).eq('id', user.id);
        if (error) throw error;
      }
      setEditingId(null);
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSaving(true);

    if (!newFullName.trim() || !newEmail.trim() || !newUsername.trim() || !newPassword.trim()) {
      setErrorMsg('Nome, E-mail, Login e Senha são obrigatórios.');
      setIsSaving(false);
      return;
    }

    try {
      if (isSupabaseConfigured && supabase) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

        const { createClient } = await import('@supabase/supabase-js');
        const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });

        const { data, error: signUpError } = await tempClient.auth.signUp({
          email: newEmail.trim(),
          password: newPassword,
          options: {
            data: {
              full_name: newFullName.trim(),
              username: newUsername.trim(),
              phone: newPhone.trim(),
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data.user && newRole !== 'collaborator') {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', data.user.id);
          if (updateError) console.error('Erro ao atualizar cargo:', updateError);
        }

      } else {
        const mockUsers = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
        const newId = Math.random().toString(36).substring(2, 9);
        const newProfile: UserProfile = {
          id: newId,
          email: newEmail.trim(),
          full_name: newFullName.trim(),
          username: newUsername.trim(),
          phone: newPhone.trim(),
          role: newRole,
          collaborator_category_id: null,
          is_active: true,
          created_at: new Date().toISOString()
        };

        mockUsers.push({
          id: newId,
          email: newEmail.trim(),
          name: newFullName.trim(),
          username: newUsername.trim(),
          phone: newPhone.trim(),
          password: newPassword,
          profile: newProfile
        });

        localStorage.setItem('laviola_mock_users', JSON.stringify(mockUsers));
      }

      setNewFullName('');
      setNewEmail('');
      setNewUsername('');
      setNewPhone('');
      setNewPassword('');
      setNewRole('collaborator');
      setIsCreating(false);
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar usuário.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredUsers = users
    .filter(u => {
      if (filterRole !== 'all' && u.role !== filterRole) return false;
      if (filterStatus === 'active' && !u.is_active) return false;
      if (filterStatus === 'inactive' && u.is_active) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.username?.toLowerCase().includes(q) ?? false) ||
          (u.phone?.includes(q) ?? false)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'role') return (roleHierarchy[b.role] || 0) - (roleHierarchy[a.role] || 0);
      return a.full_name.localeCompare(b.full_name);
    });

  return (
    <section style={styles.contentSection} aria-labelledby="users-heading">
      {/* Header */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="users-heading" style={styles.sectionTitle}>
            <Users size={20} style={{ display: 'inline', marginRight: '8px', color: styles.primary }} />
            Usuários
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color, marginTop: '4px' }}>
            {filteredUsers.length} de {users.length} usuário(s)
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          style={styles.btnAcc(hoveredBtn === 'new-user')}
          onMouseEnter={() => setHoveredBtn('new-user')}
          onMouseLeave={() => setHoveredBtn(null)}
        >
          <PlusCircle size={16} /> Novo Usuário
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginTop: '16px',
        padding: '12px',
        backgroundColor: styles.background,
        borderRadius: '10px',
        border: `1px solid ${styles.borderColor}`,
        alignItems: 'center',
      }}>
        <div style={{ flex: '1 1 200px', position: 'relative', minWidth: '160px' }}>
          <input
            type="text"
            placeholder="Buscar nome, e-mail, login..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...styles.formInput, width: '100%', paddingLeft: '34px', padding: '8px 10px 8px 34px', fontSize: '0.85rem' }}
          />
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', flex: '0 1 160px' }}
        >
          <option value="all">Todos os Cargos</option>
          {Object.entries(roleLabels).map(([role, label]) => (
            <option key={role} value={role}>{label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', flex: '0 1 140px' }}
        >
          <option value="all">Todos os Status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', flex: '0 1 160px' }}
        >
          <option value="name">Ordenar: Nome</option>
          <option value="role">Ordenar: Cargo</option>
        </select>
      </div>

      {errorMsg && (
        <div style={{ color: 'hsl(0,75%,55%)', fontSize: '0.85rem', margin: '10px 0', padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)', borderRadius: '6px', border: '1px solid hsl(0,75%,55%,0.25)' }}>
          {errorMsg}
        </div>
      )}

      {/* User List */}
      {isLoading && users.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, marginTop: '20px', textAlign: 'center' }}>Carregando...</p>
      ) : filteredUsers.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, marginTop: '20px', textAlign: 'center', padding: '30px' }}>
          Nenhum usuário corresponde aos filtros.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginTop: '16px', borderRadius: '10px', border: `1px solid ${styles.borderColor}`, overflow: 'hidden' }}>
          {filteredUsers.map((user, idx) => {
            const canAct = canManage(actorRole, user.role) && user.id !== currentUser.id;
            const badgeColor = roleBadgeColors[user.role] || styles.primary;
            const isEditing = editingId === user.id;
            const isLast = idx === filteredUsers.length - 1;

            return (
              <div key={user.id} style={{ borderBottom: isLast ? 'none' : `1px solid ${styles.borderColor}` }}>
                {/* Row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  backgroundColor: isEditing
                    ? (styles.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)')
                    : styles.cardBackground || styles.background,
                  opacity: user.is_active ? 1 : 0.6,
                  transition: 'background 0.2s',
                  flexWrap: 'wrap',
                }}>
                  {/* Avatar + Badge */}
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: badgeColor,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    flexShrink: 0,
                    borderLeft: `3px solid ${badgeColor}`,
                    boxShadow: `0 1px 4px ${badgeColor}40`,
                  }}>
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: styles.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                        {user.full_name}
                      </span>
                      <span style={{
                        width: '7px', height: '7px', borderRadius: '50%',
                        backgroundColor: user.is_active ? 'hsl(142,60%,45%)' : 'hsl(0,75%,55%)',
                        flexShrink: 0,
                      }} title={user.is_active ? 'Ativo' : 'Inativo'} />
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '20px',
                        backgroundColor: `${badgeColor}18`,
                        color: badgeColor,
                        border: `1px solid ${badgeColor}30`,
                        whiteSpace: 'nowrap',
                      }}>
                        {roleLabels[user.role]}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{user.email}</span>
                      {user.username && <span style={{ opacity: 0.7 }}>@{user.username}</span>}
                      {user.phone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Phone size={11} />{user.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {canAct && (
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: 'auto' }}>
                      <button
                        onClick={() => isEditing ? cancelEdit() : startEdit(user)}
                        title={isEditing ? 'Cancelar edição' : 'Editar usuário'}
                        aria-label={isEditing ? 'Cancelar edição' : `Editar ${user.full_name}`}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '30px', height: '30px', borderRadius: '6px', border: 'none',
                          cursor: 'pointer', transition: 'all 0.15s',
                          backgroundColor: isEditing ? `${badgeColor}25` : (styles.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'),
                          color: isEditing ? badgeColor : styles.textMain,
                        }}
                      >
                        {isEditing ? <ChevronDown size={14} /> : <Edit size={14} />}
                      </button>
                      <button
                        onClick={() => setSelectedUser(user)}
                        title="Permissões"
                        aria-label={`Permissões de ${user.full_name}`}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '30px', height: '30px', borderRadius: '6px', border: 'none',
                          cursor: 'pointer', transition: 'all 0.15s',
                          backgroundColor: styles.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                          color: styles.textMain,
                        }}
                      >
                        <Shield size={14} />
                      </button>
                      <button
                        onClick={() => toggleActive(user)}
                        title={user.is_active ? 'Desativar' : 'Ativar'}
                        aria-label={`${user.is_active ? 'Desativar' : 'Ativar'} ${user.full_name}`}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '30px', height: '30px', borderRadius: '6px', border: 'none',
                          cursor: 'pointer', transition: 'all 0.15s',
                          backgroundColor: user.is_active ? 'hsl(0,75%,55%,0.1)' : 'hsl(142,60%,45%,0.1)',
                          color: user.is_active ? 'hsl(0,75%,55%)' : 'hsl(142,60%,45%)',
                        }}
                      >
                        {user.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline Edit Form */}
                {isEditing && (
                  <div style={{
                    padding: '14px 16px',
                    backgroundColor: styles.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderTop: `1px dashed ${styles.borderColor}`,
                  }}>
                    <form onSubmit={(e) => handleUpdateUser(e, user)} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                      {/* Nome */}
                      <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: styles.sidebarWidgetText?.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Nome Completo *
                        </label>
                        <input
                          type="text"
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          required
                          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', width: '100%' }}
                        />
                      </div>

                      {/* Username */}
                      <div style={{ flex: '1 1 120px', minWidth: '100px' }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: styles.sidebarWidgetText?.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Login *
                        </label>
                        <input
                          type="text"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          required
                          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', width: '100%' }}
                        />
                      </div>

                      {/* Telefone */}
                      <div style={{ flex: '1 1 120px', minWidth: '100px' }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: styles.sidebarWidgetText?.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Celular
                        </label>
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="(21) 99999-9999"
                          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', width: '100%' }}
                        />
                      </div>

                      {/* Cargo */}
                      <div style={{ flex: '1 1 130px', minWidth: '110px' }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: styles.sidebarWidgetText?.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Cargo *
                        </label>
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as UserRole)}
                          required
                          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', width: '100%' }}
                        >
                          {Object.entries(roleLabels).map(([role, label]) => {
                            // Developer can assign any role (including developer itself).
                            // Others can only assign roles they outrank, plus keep the current role.
                            const allowed = actorRole === 'developer'
                              || canManage(actorRole, role as UserRole)
                              || role === user.role;
                            if (!allowed) return null;
                            return <option key={role} value={role}>{label}</option>;
                          })}
                        </select>
                      </div>

                      {/* Buttons */}
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="submit"
                          disabled={isSaving}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '8px 14px', borderRadius: '7px', border: 'none',
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            backgroundColor: styles.primary,
                            color: '#fff',
                            fontSize: '0.82rem', fontWeight: 600,
                            opacity: isSaving ? 0.7 : 1,
                          }}
                        >
                          <Save size={13} />
                          {isSaving ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '8px 10px', borderRadius: '7px',
                            border: `1px solid ${styles.borderColor}`,
                            cursor: 'pointer',
                            backgroundColor: 'transparent',
                            color: styles.textMain,
                            fontSize: '0.82rem',
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Permissions Panel Modal */}
      {selectedUser && (
        <PermissionsPanel
          targetUser={selectedUser}
          actorRole={actorRole}
          actorId={currentUser.id}
          styles={styles}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {/* Modal de Criação de Usuário */}
      {isCreating && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '500px' }} role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <div style={styles.modalHeader}>
              <h2 id="create-user-title" style={styles.modalTitle}>Novo Usuário</h2>
              <button 
                onClick={() => setIsCreating(false)} 
                style={styles.modalCloseBtn(hoveredBtn === 'close-create')} 
                onMouseEnter={() => setHoveredBtn('close-create')}
                onMouseLeave={() => setHoveredBtn(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label htmlFor="new-fullname" style={styles.formLabel}>Nome Completo *</label>
                <input
                  id="new-fullname"
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  style={styles.formInput}
                  placeholder="Nome completo do usuário"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="new-email" style={styles.formLabel}>E-mail (Gmail) *</label>
                <input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={styles.formInput}
                  placeholder="usuario@gmail.com"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={styles.formGroup}>
                  <label htmlFor="new-username" style={styles.formLabel}>Login (Username) *</label>
                  <input
                    id="new-username"
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    style={styles.formInput}
                    placeholder="username"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label htmlFor="new-phone" style={styles.formLabel}>Celular</label>
                  <input
                    id="new-phone"
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    style={styles.formInput}
                    placeholder="(21) 99999-9999"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={styles.formGroup}>
                  <label htmlFor="new-password" style={styles.formLabel}>Senha *</label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={styles.formInput}
                    placeholder="Mínimo 6 caracteres"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label htmlFor="new-role" style={styles.formLabel}>Cargo *</label>
                  <select
                    id="new-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    style={styles.formInput}
                    required
                  >
                    {Object.entries(roleLabels).map(([role, label]) => {
                      const allowed = actorRole === 'developer'
                        || canManage(actorRole, role as UserRole);
                      if (!allowed) return null;
                      return <option key={role} value={role}>{label}</option>;
                    })}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ ...styles.formSubmitBtn(hoveredBtn === 'submit-create'), flexGrow: 1, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onMouseEnter={() => setHoveredBtn('submit-create')}
                  onMouseLeave={() => setHoveredBtn(null)}
                >
                  <Save size={16} /> {isSaving ? 'Criando...' : 'Criar Usuário'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  style={{ ...styles.btnAcc(hoveredBtn === 'cancel-create'), padding: '12px' }}
                  onMouseEnter={() => setHoveredBtn('cancel-create')}
                  onMouseLeave={() => setHoveredBtn(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
