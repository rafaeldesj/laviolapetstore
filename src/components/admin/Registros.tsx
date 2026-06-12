import React, { useState, useEffect, useCallback } from 'react';
import { History, Search, Filter, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchLogs } from '../../supabaseClient';
import type { AuditLog } from '../../supabaseClient';

interface RegistrosProps {
  styles: any;
}

const actionBadgeColors: Record<string, { bg: string; text: string; border: string }> = {
  'Criação de Usuário': { bg: 'rgba(75, 192, 192, 0.08)', text: 'hsl(142, 60%, 40%)', border: 'rgba(75, 192, 192, 0.25)' },
  'Cadastro de Pet': { bg: 'rgba(75, 192, 192, 0.08)', text: 'hsl(142, 60%, 40%)', border: 'rgba(75, 192, 192, 0.25)' },
  'Novo Agendamento': { bg: 'rgba(75, 192, 192, 0.08)', text: 'hsl(142, 60%, 40%)', border: 'rgba(75, 192, 192, 0.25)' },
  
  'Edição de Usuário': { bg: 'rgba(54, 162, 235, 0.08)', text: 'hsl(210, 85%, 45%)', border: 'rgba(54, 162, 235, 0.25)' },
  'Edição de Pet': { bg: 'rgba(54, 162, 235, 0.08)', text: 'hsl(210, 85%, 45%)', border: 'rgba(54, 162, 235, 0.25)' },
  'Atualização de Agendamento': { bg: 'rgba(54, 162, 235, 0.08)', text: 'hsl(210, 85%, 45%)', border: 'rgba(54, 162, 235, 0.25)' },
  
  'Ativação de Usuário': { bg: 'rgba(255, 206, 86, 0.08)', text: 'hsl(36, 95%, 45%)', border: 'rgba(255, 206, 86, 0.25)' },
  'Desativação de Usuário': { bg: 'rgba(255, 159, 64, 0.08)', text: 'hsl(25, 95%, 50%)', border: 'rgba(255, 159, 64, 0.25)' },
  
  'Exclusão de Usuário': { bg: 'rgba(255, 99, 132, 0.08)', text: 'hsl(0, 75%, 55%)', border: 'rgba(255, 99, 132, 0.25)' },
  'Exclusão de Pet': { bg: 'rgba(255, 99, 132, 0.08)', text: 'hsl(0, 75%, 55%)', border: 'rgba(255, 99, 132, 0.25)' },
  'Exclusão de Agendamento': { bg: 'rgba(255, 99, 132, 0.08)', text: 'hsl(0, 75%, 55%)', border: 'rgba(255, 99, 132, 0.25)' },
};

const getBadgeStyle = (action: string) => {
  return actionBadgeColors[action] || {
    bg: 'rgba(120, 120, 120, 0.08)',
    text: 'hsl(0, 0%, 40%)',
    border: 'rgba(120, 120, 120, 0.25)'
  };
};

export const Registros: React.FC<RegistrosProps> = ({ styles }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchLogs();
      setLogs(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar registros de auditoria.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Extract unique action types and users for filtering options
  const actionTypes = Array.from(new Set(logs.map((l) => l.action))).sort();
  const usersList = Array.from(
    new Set(
      logs.map((l) => JSON.stringify({ email: l.user_email, name: l.user_name }))
    )
  )
    .map((s) => JSON.parse(s))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (filterUser !== 'all' && log.user_email !== filterUser) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.details.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.user_name.toLowerCase().includes(q) ||
        log.user_email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const datePart = d.toLocaleDateString('pt-BR');
      const timePart = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${datePart} às ${timePart}`;
    } catch {
      return isoString;
    }
  };

  return (
    <section style={styles.contentSection} aria-labelledby="registros-heading">
      {/* Header */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="registros-heading" style={styles.sectionTitle}>
            <History size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Registros de Sistema
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Histórico completo de alterações e atividades no banco de dados e no sistema.
          </p>
        </div>

        <button
          onClick={loadLogs}
          disabled={isLoading}
          style={{
            ...styles.btnAcc(false),
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={14} className={isLoading ? 'spin-animation' : ''} />
          Atualizar
        </button>
      </div>

      {errorMsg && (
        <div style={{
          color: 'hsl(0,75%,55%)',
          fontSize: '0.85rem',
          margin: '15px 0',
          padding: '8px 12px',
          backgroundColor: 'hsl(0,75%,55%,0.08)',
          borderRadius: '6px',
          border: '1px solid hsl(0,75%,55%,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Filters Panel */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginTop: '20px',
        padding: '12px 14px',
        backgroundColor: styles.background,
        borderRadius: '10px',
        border: `1px solid ${styles.borderColor}`,
        alignItems: 'center',
      }}>
        {/* Search */}
        <div style={{ flex: '2 1 240px', position: 'relative', minWidth: '200px' }}>
          <input
            type="text"
            placeholder="Buscar por descrição, usuário, e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              ...styles.formInput,
              width: '100%',
              paddingLeft: '34px',
              padding: '8px 10px 8px 34px',
              fontSize: '0.85rem'
            }}
          />
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
        </div>

        {/* Action filter */}
        <div style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={14} style={{ color: styles.sidebarWidgetText?.color }} />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', width: '100%' }}
          >
            <option value="all">Todas as Ações</option>
            {actionTypes.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </div>

        {/* User filter */}
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', flex: '1 1 180px' }}
        >
          <option value="all">Todos os Administradores</option>
          {usersList.map((u) => (
            <option key={u.email} value={u.email}>{u.name} ({u.email})</option>
          ))}
        </select>
      </div>

      {/* Logs Table / List */}
      {isLoading && logs.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, marginTop: '30px', textAlign: 'center' }}>Carregando registros...</p>
      ) : filteredLogs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '50px 20px',
          border: `1px dashed ${styles.borderColor}`,
          borderRadius: '12px',
          marginTop: '20px'
        }}>
          <History size={40} style={{ color: styles.secondary, margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
          <p style={{ color: styles.sidebarWidgetText?.color, fontWeight: 500 }}>
            Nenhum registro de atividade corresponde aos filtros atuais.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '16px',
          borderRadius: '10px',
          border: `1px solid ${styles.borderColor}`,
          overflow: 'hidden'
        }}>
          {filteredLogs.map((log, index) => {
            const badge = getBadgeStyle(log.action);
            const isLast = index === filteredLogs.length - 1;
            const isLocalLog = !log.id || isNaN(Number(log.id)) && log.id.length < 10; // Simple heuristic to show local vs remote

            return (
              <div
                key={log.id || index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px 16px',
                  backgroundColor: styles.cardBackground || styles.background,
                  borderBottom: isLast ? 'none' : `1px solid ${styles.borderColor}`,
                  transition: 'background 0.2s',
                }}
              >
                {/* Top line: Action badge + Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '20px',
                      backgroundColor: badge.bg,
                      color: badge.text,
                      border: `1px solid ${badge.border}`,
                    }}>
                      {log.action}
                    </span>
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isLocalLog ? 'rgba(100, 100, 100, 0.08)' : 'rgba(54, 162, 235, 0.08)',
                      color: isLocalLog ? styles.sidebarWidgetText?.color : 'hsl(210, 85%, 45%)',
                      border: `1px solid ${isLocalLog ? styles.borderColor : 'rgba(54, 162, 235, 0.2)'}`,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                    }}>
                      {isLocalLog ? 'MOCK LOCAL' : 'BD SUPABASE'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>
                    {formatDate(log.created_at)}
                  </span>
                </div>

                {/* Middle details text */}
                <div style={{ fontSize: '0.88rem', color: styles.textMain, lineHeight: '1.4' }}>
                  {log.details}
                </div>

                {/* Bottom line: Executor */}
                <div style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, display: 'flex', gap: '6px' }}>
                  Realizado por: <strong style={{ color: styles.textMain }}>{log.user_name}</strong> <span style={{ opacity: 0.85 }}>({log.user_email})</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
