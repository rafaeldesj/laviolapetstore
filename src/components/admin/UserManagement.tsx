import React, { useState, useEffect } from 'react';
import { Users, Shield, UserCheck, UserX } from 'lucide-react';
import type { UserProfile, UserRole } from '../../supabaseClient';
import { supabase, roleLabels, canManage } from '../../supabaseClient';
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
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<string>('all');

  const actorRole = currentUser.profile?.role || 'collaborator';

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    if (!supabase) return;
    setIsLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from('profiles')
      .select(`*, collaborator_category:collaborator_categories(id, name, description, is_active)`)
      .order('role')
      .order('full_name');
    if (error) {
      setErrorMsg(error.message);
    } else {
      setUsers(data || []);
    }
    setIsLoading(false);
  };

  const toggleActive = async (user: UserProfile) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !user.is_active })
      .eq('id', user.id);
    if (!error) fetchUsers();
  };

  const filteredUsers = users.filter(u =>
    filterRole === 'all' ? true : u.role === filterRole
  );

  return (
    <section style={styles.contentSection} aria-labelledby="users-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="users-heading" style={styles.sectionTitle}>
            <Users size={20} style={{ display: 'inline', marginRight: '8px', color: styles.primary }} />
            Gestão de Usuários
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            {users.length} usuário(s) cadastrado(s)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            style={{ ...styles.formInput, padding: '8px 12px', width: 'auto' }}
          >
            <option value="all">Todos os Papéis</option>
            {Object.entries(roleLabels).map(([role, label]) => (
              <option key={role} value={role}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <p style={{ color: 'red', fontSize: '0.9rem' }}>{errorMsg}</p>
      )}

      {isLoading ? (
        <p style={{ color: styles.sidebarWidgetText?.color }}>Carregando usuários...</p>
      ) : filteredUsers.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color }}>Nenhum usuário encontrado.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
          {filteredUsers.map(user => {
            const canAct = canManage(actorRole, user.role) && user.id !== currentUser.id;
            return (
              <div key={user.id} style={{
                ...styles.petCard,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: '12px',
                opacity: user.is_active ? 1 : 0.6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    ...styles.userAvatar, width: '40px', height: '40px', fontSize: '1rem',
                    fontWeight: 700, color: '#fff',
                    backgroundColor: roleBadgeColors[user.role] || styles.primary,
                    border: 'none',
                  }}>
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: styles.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {user.full_name}
                      {!user.is_active && (
                        <span style={{ fontSize: '0.7rem', color: 'hsl(0, 75%, 55%)', fontWeight: 600 }}>
                          INATIVO
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>
                      {user.email}
                      {user.username && ` · @${user.username}`}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{
                        ...styles.petBadge, fontSize: '0.7rem',
                        backgroundColor: roleBadgeColors[user.role] + '22',
                        color: roleBadgeColors[user.role],
                        border: `1px solid ${roleBadgeColors[user.role]}44`,
                      }}>
                        {roleLabels[user.role]}
                      </span>
                      {user.collaborator_category && (
                        <span style={styles.petBadge}>
                          {(user.collaborator_category as any)?.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {canAct && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setSelectedUser(user)}
                      style={styles.btnIcon(hoveredBtn === `perms-${user.id}`)}
                      onMouseEnter={() => setHoveredBtn(`perms-${user.id}`)}
                      onMouseLeave={() => setHoveredBtn(null)}
                      title="Gerenciar Permissões"
                      aria-label={`Gerenciar permissões de ${user.full_name}`}
                    >
                      <Shield size={16} />
                    </button>
                    <button
                      onClick={() => toggleActive(user)}
                      style={styles.btnIcon(hoveredBtn === `toggle-${user.id}`, !user.is_active)}
                      onMouseEnter={() => setHoveredBtn(`toggle-${user.id}`)}
                      onMouseLeave={() => setHoveredBtn(null)}
                      title={user.is_active ? 'Desativar usuário' : 'Ativar usuário'}
                      aria-label={`${user.is_active ? 'Desativar' : 'Ativar'} ${user.full_name}`}
                    >
                      {user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedUser && (
        <PermissionsPanel
          targetUser={selectedUser}
          actorRole={actorRole}
          actorId={currentUser.id}
          styles={styles}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </section>
  );
};
