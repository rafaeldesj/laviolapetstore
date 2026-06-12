import React, { useState, useEffect } from 'react';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import type { PermissionKey, UserProfile } from '../../supabaseClient';
import { supabase, roleLabels } from '../../supabaseClient';

interface PermissionsPanelProps {
  targetUser: UserProfile;
  actorRole: string;
  actorId: string;
  styles: any;
  onClose: () => void;
}

interface PermissionState {
  [key: string]: boolean;
}

export const PermissionsPanel: React.FC<PermissionsPanelProps> = ({
  targetUser,
  actorId,
  styles,
  onClose,
}) => {
  const [allPermissions, setAllPermissions] = useState<PermissionKey[]>([]);
  const [userPermissions, setUserPermissions] = useState<PermissionState>({});
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [targetUser.id]);

  const fetchData = async () => {
    setIsLoading(true);
    if (!supabase) {
      const mockKeys = [
        { key: 'manage_users', label: 'Gerenciar Usuários', description: 'Permite ativar/desativar e editar permissões de usuários.', module: 'Administração' },
        { key: 'view_financial', label: 'Visualizar Financeiro', description: 'Acesso ao caixa e relatórios financeiros.', module: 'Financeiro' },
        { key: 'manage_stock', label: 'Gerenciar Estoque', description: 'Adicionar, editar e remover produtos.', module: 'Estoque' },
        { key: 'veterinary_records', label: 'Prontuários Veterinários', description: 'Criar e editar prontuários médicos de animais.', module: 'Clínica' },
      ];
      setAllPermissions(mockKeys);
      
      const savedPerms = JSON.parse(localStorage.getItem(`laviola_mock_perms_${targetUser.id}`) || '{}');
      setUserPermissions(savedPerms);
      
      const modules = new Set(mockKeys.map(k => k.module));
      setExpandedModules(modules);
      setIsLoading(false);
      return;
    }
    const [{ data: keys }, { data: perms }] = await Promise.all([
      supabase.from('permission_keys').select('*').order('module'),
      supabase.from('user_permissions').select('*').eq('user_id', targetUser.id),
    ]);
    if (keys) setAllPermissions(keys);
    const state: PermissionState = {};
    if (perms) {
      perms.forEach(p => { state[p.permission_key] = p.granted; });
    }
    setUserPermissions(state);
    if (keys) {
      const modules = new Set(keys.map(k => k.module));
      setExpandedModules(modules);
    }
    setIsLoading(false);
  };

  const togglePermission = async (key: string, currentValue: boolean) => {
    setErrorMsg(null);
    setIsSaving(key);
    const newValue = !currentValue;
    if (!supabase) {
      const savedPerms = JSON.parse(localStorage.getItem(`laviola_mock_perms_${targetUser.id}`) || '{}');
      savedPerms[key] = newValue;
      localStorage.setItem(`laviola_mock_perms_${targetUser.id}`, JSON.stringify(savedPerms));
      setUserPermissions(prev => ({ ...prev, [key]: newValue }));
      setIsSaving(null);
      return;
    }
    try {
      const { error } = await supabase
        .from('user_permissions')
        .upsert({
          user_id: targetUser.id,
          permission_key: key,
          granted: newValue,
          granted_by: actorId,
          granted_at: new Date().toISOString(),
        }, { onConflict: 'user_id,permission_key' });
      if (error) throw error;
      setUserPermissions(prev => ({ ...prev, [key]: newValue }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar permissão.');
    } finally {
      setIsSaving(null);
    }
  };

  const toggleModule = (module: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  const modules = [...new Set(allPermissions.map(p => p.module))];

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}
        role="dialog" aria-modal="true" aria-labelledby="permissions-title">
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={20} style={{ color: styles.primary }} />
            <div>
              <h2 id="permissions-title" style={{ ...styles.modalTitle, fontSize: '1.2rem', margin: 0 }}>
                Permissões de {targetUser.full_name}
              </h2>
              <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                {roleLabels[targetUser.role]}
                {targetUser.collaborator_category ? ` · ${(targetUser.collaborator_category as any)?.name}` : ''}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
        </div>

        {errorMsg && (
          <p style={{ color: 'red', fontSize: '0.85rem', margin: '0' }}>{errorMsg}</p>
        )}

        {isLoading ? (
          <p style={{ color: styles.sidebarWidgetText?.color }}>Carregando permissões...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {modules.map(module => {
              const modulePerms = allPermissions.filter(p => p.module === module);
              const isExpanded = expandedModules.has(module);
              return (
                <div key={module} style={{ border: `1px solid ${styles.borderColor}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleModule(module)}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 700, fontSize: '0.95rem', color: styles.primary,
                    }}
                  >
                    {module}
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${styles.borderColor}` }}>
                      {modulePerms.map(perm => {
                        const isGranted = userPermissions[perm.key] === true;
                        const isBusy = isSaving === perm.key;
                        return (
                          <div key={perm.key}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '10px 16px', borderBottom: `1px solid ${styles.borderColor}`,
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: styles.textMain }}>{perm.label}</div>
                              <div style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>{perm.description}</div>
                            </div>

                            <button
                              onClick={() => togglePermission(perm.key, isGranted)}
                              disabled={isBusy}
                              aria-label={`${isGranted ? 'Revogar' : 'Conceder'} permissão ${perm.label}`}
                              style={{
                                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                backgroundColor: isGranted ? 'hsl(142, 70%, 45%)' : 'hsl(0, 0%, 80%)',
                                position: 'relative', transition: 'background-color 0.2s ease', flexShrink: 0,
                                opacity: isBusy ? 0.5 : 1,
                              }}
                            >
                              <span style={{
                                position: 'absolute', top: '2px',
                                left: isGranted ? '22px' : '2px',
                                width: '20px', height: '20px', borderRadius: '50%',
                                backgroundColor: '#ffffff', transition: 'left 0.2s ease',
                              }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
