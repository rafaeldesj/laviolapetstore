import React, { useState } from 'react';
import { Settings, Eye, Database, Trash2, RotateCcw, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { logAction, isSupabaseConfigured } from '../../supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface ConfiguracoesProps {
  styles: any;
  highContrast: boolean;
  setHighContrast: (val: boolean) => void;
  fontSize: number;
  setFontSize: (val: number) => void;
}

export const Configuracoes: React.FC<ConfiguracoesProps> = ({
  styles,
  highContrast,
  setHighContrast,
  fontSize,
  setFontSize,
}) => {
  const { user } = useAuth();
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const userRole = user?.profile?.role;
  const isDev = userRole === 'developer';
  const [activeTab, setActiveTab] = useState<'visual' | 'sistema'>('visual');

  const handleToggleContrast = async () => {
    const nextVal = !highContrast;
    setHighContrast(nextVal);
    
    // Log action
    await logAction(
      user?.email || '',
      user?.name || 'Administrador',
      'Configurações Acessibilidade',
      `O Alto Contraste foi ${nextVal ? 'ativado' : 'desativado'}.`
    );
    showFeedback(`Alto contraste ${nextVal ? 'ativado' : 'desativado'} com sucesso!`, 'success');
  };

  const handleFontSizeChange = async (val: number) => {
    setFontSize(val);
    
    // Log action
    await logAction(
      user?.email || '',
      user?.name || 'Administrador',
      'Configurações Acessibilidade',
      `O tamanho da fonte base foi alterado para ${val}px.`
    );
    showFeedback(`Tamanho de fonte alterado para ${val}px!`, 'success');
  };

  const showFeedback = (text: string, type: 'success' | 'error') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleResetSystemData = async () => {
    const confirmed = window.confirm(
      'Tem certeza de que deseja redefinir todos os dados locais do sistema? Isso removerá agendamentos, pets e usuários mock criados e redefinirá para os padrões de fábrica.'
    );
    if (!confirmed) return;

    try {
      // Clear localStorage items
      localStorage.removeItem('laviola_pets');
      localStorage.removeItem('laviola_appointments');
      localStorage.removeItem('laviola_mock_users');
      localStorage.removeItem('laviola_mock_session');
      localStorage.removeItem('laviola_audit_logs');

      // Log action
      await logAction(
        user?.email || '',
        user?.name || 'Administrador',
        'Manutenção de Sistema',
        'Todos os dados mock locais do sistema foram redefinidos para os padrões de fábrica.'
      );

      showFeedback('Todos os dados locais foram redefinidos. Recarregando a página...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      showFeedback('Erro ao redefinir dados locais: ' + err.message, 'error');
    }
  };

  const handleClearLocalLogs = async () => {
    const confirmed = window.confirm(
      'Tem certeza de que deseja limpar os logs de auditoria locais? Logs remotos do Supabase não serão afetados.'
    );
    if (!confirmed) return;

    try {
      localStorage.removeItem('laviola_audit_logs');
      await logAction(
        user?.email || '',
        user?.name || 'Administrador',
        'Manutenção de Sistema',
        'Os logs de auditoria locais (localStorage) foram limpos.'
      );
      showFeedback('Logs locais limpos com sucesso!', 'success');
    } catch (err: any) {
      showFeedback('Erro ao limpar logs locais: ' + err.message, 'error');
    }
  };

  const showSistemaTab = isDev;
  const tabs = [
    { id: 'visual' as const, label: 'Visual & Acessibilidade', icon: <Eye size={16} /> },
    ...(showSistemaTab ? [{ id: 'sistema' as const, label: 'Banco de Dados & Sistema', icon: <Database size={16} /> }] : []),
  ];

  return (
    <section style={styles.contentSection} aria-labelledby="settings-heading">
      {/* Header */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="settings-heading" style={styles.sectionTitle}>
            <Settings size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Configurações do Sistema
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Ajuste preferências de acessibilidade visual e realize manutenção de dados do sistema.
          </p>
        </div>
      </div>

      {feedbackMsg && (
        <div style={{
          color: feedbackMsg.type === 'success' ? 'hsl(142,60%,40%)' : 'hsl(0,75%,55%)',
          fontSize: '0.85rem',
          margin: '15px 0',
          padding: '10px 14px',
          backgroundColor: feedbackMsg.type === 'success' ? 'hsl(142,60%,45%,0.08)' : 'hsl(0,75%,55%,0.08)',
          borderRadius: '8px',
          border: `1px solid ${feedbackMsg.type === 'success' ? 'hsl(142,60%,45%,0.25)' : 'hsl(0,75%,55%,0.25)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.3s ease',
        }}>
          {feedbackMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {feedbackMsg.text}
        </div>
      )}

      {/* Tabs Menu */}
      {showSistemaTab && (
        <div style={{
          display: 'flex',
          gap: '8px',
          marginTop: '20px',
          borderBottom: `2px solid ${styles.borderColor}`,
          paddingBottom: '0',
          marginBottom: '20px'
        }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? `3px solid ${styles.primary}` : '3px solid transparent',
                  color: isActive ? styles.primary : styles.sidebarWidgetText?.color,
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  marginBottom: '-2px',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: '20px',
        maxWidth: '600px',
      }}>
        {/* Card 1: Acessibilidade */}
        {activeTab === 'visual' && (
          <div style={{
            backgroundColor: styles.cardBackground || styles.background,
            padding: '24px',
            borderRadius: '12px',
            border: `1px solid ${styles.borderColor}`,
            boxShadow: styles.shadow,
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>
            <h3 style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: styles.primary,
              margin: '0 0 4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Eye size={18} /> Acessibilidade & Visual
            </h3>
            <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, margin: 0 }}>
              Personalize a aparência do sistema para melhor se adequar ao seu uso e leitura.
            </p>

            <hr style={{ border: 'none', borderTop: `1px solid ${styles.borderColor}`, margin: '0' }} />

            {/* Alto Contraste Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '0.9rem', color: styles.textMain }}>Alto Contraste</strong>
                <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>Aumenta o contraste das cores do sistema</span>
              </div>
              <button
                onClick={handleToggleContrast}
                style={{
                  width: '50px',
                  height: '26px',
                  borderRadius: '13px',
                  backgroundColor: highContrast ? styles.primary : '#ccc',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background-color 0.2s',
                  padding: '0 3px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transform: highContrast ? 'translateX(24px)' : 'translateX(0)',
                  transition: 'transform 0.2s',
                }} />
              </button>
            </div>

            {/* Tamanho da Fonte Slider/Buttons */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: styles.textMain }}>Tamanho da Fonte</strong>
                  <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>Ajusta o tamanho das fontes da tela</span>
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: styles.primary }}>{fontSize}px</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                {[14, 16, 18, 20].map((size) => (
                  <button
                    key={size}
                    onClick={() => handleFontSizeChange(size)}
                    style={{
                      flex: '1 1 50px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: `1.5px solid ${fontSize === size ? styles.primary : styles.borderColor}`,
                      backgroundColor: fontSize === size ? `${styles.primary}12` : 'transparent',
                      color: fontSize === size ? styles.primary : styles.textMain,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      transition: 'all 0.15s',
                    }}
                  >
                    {size === 14 ? 'Pequeno (14)' : size === 16 ? 'Padrão (16)' : size === 18 ? 'Grande (18)' : 'Giga (20)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Card 2: Conexão & Manutenção */}
        {activeTab === 'sistema' && showSistemaTab && (
          <div style={{
            backgroundColor: styles.cardBackground || styles.background,
            padding: '24px',
            borderRadius: '12px',
            border: `1px solid ${styles.borderColor}`,
            boxShadow: styles.shadow,
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>
            <h3 style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: styles.primary,
              margin: '0 0 4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Database size={18} /> Conexão & Manutenção
            </h3>
            
            {/* Status da Conexão */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: isSupabaseConfigured ? 'rgba(75, 192, 192, 0.08)' : 'rgba(255, 159, 64, 0.08)',
              border: `1px solid ${isSupabaseConfigured ? 'rgba(75, 192, 192, 0.2)' : 'rgba(255, 159, 64, 0.2)'}`,
              padding: '10px 12px',
              borderRadius: '8px',
            }}>
              <Info size={18} style={{ color: isSupabaseConfigured ? 'hsl(142, 60%, 40%)' : 'hsl(25, 95%, 50%)', flexShrink: 0 }} />
              <div>
                <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: styles.textMain }}>
                  Modo: {isSupabaseConfigured ? 'Supabase Conectado' : 'Mock Local (Sem Supabase)'}
                </span>
                <span style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color }}>
                  {isSupabaseConfigured 
                    ? 'Os dados do sistema estão sendo salvos e lidos diretamente do banco de dados PostgreSQL na nuvem.'
                    : 'Os dados estão salvos apenas neste navegador (via localStorage). As ações de banco de dados são emuladas.'
                  }
                </span>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: `1px solid ${styles.borderColor}`, margin: '0' }} />

            {/* Ações de Limpeza / Redefinição */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handleClearLocalLogs}
                onMouseEnter={() => setHoveredBtn('clear-logs')}
                onMouseLeave={() => setHoveredBtn(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${hoveredBtn === 'clear-logs' ? 'hsl(0,75%,55%)' : styles.borderColor}`,
                  backgroundColor: hoveredBtn === 'clear-logs' ? 'hsl(0,75%,55%,0.08)' : 'transparent',
                  color: hoveredBtn === 'clear-logs' ? 'hsl(0,75%,55%)' : styles.textMain,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Trash2 size={14} />
                Limpar Logs Locais (Cache)
              </button>

              <button
                onClick={handleResetSystemData}
                onMouseEnter={() => setHoveredBtn('reset-data')}
                onMouseLeave={() => setHoveredBtn(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: hoveredBtn === 'reset-data' ? 'hsl(0,75%,45%)' : 'hsl(0,75%,55%)',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: hoveredBtn === 'reset-data' ? 'none' : '0 2px 4px rgba(220,53,69,0.25)',
                }}
              >
                <RotateCcw size={14} />
                Redefinir Banco de Dados Local
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
