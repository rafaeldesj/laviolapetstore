import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, CalendarDays, Clock, CheckCircle2, XCircle,
  AlertCircle, Loader2, PawPrint, RefreshCw, X, Lock, ShieldCheck
} from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured } from '../supabaseClient';
import type { Appointment } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';

interface PagamentosProps {
  styles: any;
  currentUser: AuthUser;
}

const serviceValueMap: Record<string, number> = {
  'Banho & Tosa': 80,
  'Consulta Veterinária': 150,
  'Vacinação': 95,
  'Hotelzinho / Creche': 120,
  'Outro': 70,
};

const statusConfig: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
  'Agendado':    { bg: 'rgba(54,162,235,0.08)',   text: 'hsl(210,85%,45%)', border: 'rgba(54,162,235,0.25)',   icon: <Clock size={13} />,         label: 'Agendado' },
  'Em Andamento':{ bg: 'rgba(255,206,86,0.08)',   text: 'hsl(36,95%,45%)',  border: 'rgba(255,206,86,0.25)',   icon: <Loader2 size={13} />,       label: 'Em Andamento' },
  'Concluído':   { bg: 'rgba(75,192,192,0.08)',   text: 'hsl(142,60%,40%)', border: 'rgba(75,192,192,0.25)',   icon: <CheckCircle2 size={13} />,  label: 'Concluído' },
  'Cancelado':   { bg: 'rgba(255,99,132,0.08)',   text: 'hsl(0,75%,55%)',   border: 'rgba(255,99,132,0.25)',   icon: <XCircle size={13} />,       label: 'Cancelado' },
};

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch { return iso; }
};

export const Pagamentos: React.FC<PagamentosProps> = ({ styles, currentUser }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'todos' | 'concluidos' | 'agendados'>('todos');
  const [payingFor, setPayingFor] = useState<Appointment | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('appointments')
          .select('*, pets(*)')
          .eq('owner_id', currentUser.id)
          .order('scheduled_at', { ascending: false });
        if (error) throw error;
        const mapped = (data || []).map((item: any) => ({
          id: item.id,
          pet_id: item.pet_id,
          pet_name: item.pets?.name || item.pet_name || 'Desconhecido',
          owner_id: item.owner_id,
          service_type: item.service_type,
          scheduled_at: item.scheduled_at,
          status: item.status,
          notes: item.notes || '',
          created_at: item.created_at,
        }));
        setAppointments(mapped);
      } else {
        const { data } = await mockSupabaseDb.getAppointments(currentUser.id, false);
        setAppointments(data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar serviços.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const filtered = appointments.filter(a => {
    if (activeTab === 'concluidos') return a.status === 'Concluído';
    if (activeTab === 'agendados')  return a.status === 'Agendado' || a.status === 'Em Andamento';
    return a.status !== 'Cancelado';
  });

  const totalPendente = appointments
    .filter(a => a.status === 'Concluído')
    .reduce((sum, a) => sum + (serviceValueMap[a.service_type] || 70), 0);

  const tabs = [
    { id: 'todos',     label: 'Todos os Serviços' },
    { id: 'agendados', label: 'Próximos' },
    { id: 'concluidos',label: 'Realizados' },
  ] as const;

  return (
    <section style={styles.contentSection} aria-labelledby="pagamentos-heading">

      {/* ── Header ── */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="pagamentos-heading" style={styles.sectionTitle}>
            <CreditCard
              size={20}
              style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }}
            />
            Meus Pagamentos
            <div style={styles.sectionTitleBar} />
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Acompanhe seus serviços agendados e realize pagamentos de forma segura.
          </p>
        </div>

        <button
          onClick={fetchAppointments}
          disabled={isLoading}
          style={{
            ...styles.btnAcc(hoveredBtn === 'refresh'),
            display: 'flex', alignItems: 'center', gap: '6px',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={() => setHoveredBtn('refresh')}
          onMouseLeave={() => setHoveredBtn(null)}
        >
          <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* ── Error ── */}
      {errorMsg && (
        <div style={{
          color: 'hsl(0,75%,55%)', fontSize: '0.85rem', margin: '15px 0',
          padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)',
          borderRadius: '6px', border: '1px solid hsl(0,75%,55%,0.25)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {/* ── Metric Card ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: '16px',
        marginTop: '20px',
      }}>
        {/* Total de serviços */}
        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px',
          boxShadow: styles.shadow,
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'rgba(54,162,235,0.1)', color: 'hsl(210,85%,45%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CalendarDays size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>
              Total de Serviços
            </span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: styles.textMain }}>
              {appointments.filter(a => a.status !== 'Cancelado').length}
            </strong>
          </div>
        </div>

        {/* Serviços realizados */}
        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${appointments.some(a => a.status === 'Concluído') ? 'rgba(75,192,192,0.3)' : styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px',
          boxShadow: styles.shadow,
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'rgba(75,192,192,0.1)', color: 'hsl(142,60%,40%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>
              Realizados
            </span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: 'hsl(142,60%,40%)' }}>
              {appointments.filter(a => a.status === 'Concluído').length}
            </strong>
          </div>
        </div>

        {/* Valor estimado */}
        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${totalPendente > 0 ? `rgba(139,92,246,0.3)` : styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px',
          boxShadow: styles.shadow,
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'rgba(139,92,246,0.1)', color: 'hsl(262,80%,58%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CreditCard size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>
              Valor Total Est.
            </span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: 'hsl(262,80%,58%)' }}>
              R$ {totalPendente.toFixed(2)}
            </strong>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', gap: '4px', marginTop: '28px',
        borderBottom: `1px solid ${styles.borderColor}`, paddingBottom: '0',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600, fontSize: '0.88rem',
              padding: '8px 16px',
              color: activeTab === tab.id ? styles.primary : styles.sidebarWidgetText?.color,
              borderBottom: activeTab === tab.id ? `3px solid ${styles.primary}` : '3px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {isLoading && filtered.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, marginTop: '30px', textAlign: 'center' }}>
          Carregando serviços…
        </p>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', marginTop: '20px',
          border: `1px dashed ${styles.borderColor}`, borderRadius: '12px',
        }}>
          <PawPrint size={40} style={{ color: styles.secondary, margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
          <p style={{ color: styles.sidebarWidgetText?.color, fontWeight: 500 }}>
            Nenhum serviço encontrado para este filtro.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px',
        }}>
          {filtered.map(app => {
            const st = statusConfig[app.status] || statusConfig['Agendado'];
            const valor = serviceValueMap[app.service_type] || 70;
            const isConcluido = app.status === 'Concluído';

            return (
              <article
                key={app.id}
                style={{
                  background: styles.cardBackground || styles.background,
                  border: `1px solid ${isConcluido ? 'rgba(139,92,246,0.2)' : styles.borderColor}`,
                  borderRadius: '12px', padding: '16px 20px',
                  boxShadow: styles.shadow,
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                  gap: '14px', transition: 'box-shadow 0.2s',
                }}
              >
                {/* Ícone do serviço */}
                <div style={{
                  width: '46px', height: '46px', borderRadius: '50%', flexShrink: 0,
                  background: isConcluido ? 'rgba(139,92,246,0.1)' : 'rgba(54,162,235,0.08)',
                  color: isConcluido ? 'hsl(262,80%,58%)' : styles.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CalendarDays size={20} />
                </div>

                {/* Info */}
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '1rem', color: styles.textMain }}>
                      {app.service_type}
                    </strong>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
                      borderRadius: '20px', backgroundColor: st.bg,
                      color: st.text, border: `1px solid ${st.border}`,
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      {st.icon} {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color, marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <span>🐾 {app.pet_name}</span>
                    <span>📅 {formatDate(app.scheduled_at)}</span>
                    {app.notes && <span style={{ fontStyle: 'italic' }}>"{app.notes}"</span>}
                  </div>
                </div>

                {/* Valor + Botão */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color, display: 'block' }}>
                      Valor estimado
                    </span>
                    <strong style={{ fontSize: '1.1rem', color: isConcluido ? 'hsl(262,80%,58%)' : styles.textMain }}>
                      R$ {valor.toFixed(2)}
                    </strong>
                  </div>

                  {isConcluido && (
                    <button
                      onClick={() => setPayingFor(app)}
                      onMouseEnter={() => setHoveredBtn(`pay-${app.id}`)}
                      onMouseLeave={() => setHoveredBtn(null)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '9px 16px', borderRadius: '8px', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                        fontSize: '0.82rem', transition: 'all 0.2s',
                        background: hoveredBtn === `pay-${app.id}`
                          ? 'linear-gradient(135deg, hsl(262,80%,50%), hsl(262,80%,40%))'
                          : 'linear-gradient(135deg, hsl(262,80%,58%), hsl(262,80%,48%))',
                        color: '#fff',
                        boxShadow: hoveredBtn === `pay-${app.id}`
                          ? '0 4px 15px rgba(139,92,246,0.4)'
                          : '0 2px 8px rgba(139,92,246,0.25)',
                        transform: hoveredBtn === `pay-${app.id}` ? 'translateY(-1px)' : 'none',
                      }}
                    >
                      <CreditCard size={14} /> Pagar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Modal Placeholder de Pagamento ── */}
      {payingFor && (
        <div style={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setPayingFor(null); }}>
          <div
            style={{ ...styles.modalContent, maxWidth: '480px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-modal-title"
          >
            {/* Header do modal */}
            <div style={styles.modalHeader}>
              <h2 id="pay-modal-title" style={styles.modalTitle}>
                <CreditCard size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                Pagamento
              </h2>
              <button
                onClick={() => setPayingFor(null)}
                style={styles.modalCloseBtn(false)}
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Resumo do serviço */}
            <div style={{
              background: styles.background,
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '20px',
              border: `1px solid ${styles.borderColor}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color, margin: 0 }}>Serviço</p>
                  <strong style={{ color: styles.textMain }}>{payingFor.service_type}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color, margin: 0 }}>Pet</p>
                  <strong style={{ color: styles.textMain }}>{payingFor.pet_name}</strong>
                </div>
              </div>
              <div style={{
                marginTop: '12px', paddingTop: '12px',
                borderTop: `1px solid ${styles.borderColor}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>
                  {formatDate(payingFor.scheduled_at)}
                </span>
                <strong style={{ fontSize: '1.25rem', color: 'hsl(262,80%,58%)' }}>
                  R$ {(serviceValueMap[payingFor.service_type] || 70).toFixed(2)}
                </strong>
              </div>
            </div>

            {/* Aviso de integração pendente */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', padding: '24px 16px', gap: '14px',
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'rgba(139,92,246,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ShieldCheck size={32} style={{ color: 'hsl(262,80%,58%)' }} />
              </div>

              <div>
                <h3 style={{ margin: '0 0 8px', color: styles.textMain, fontSize: '1.05rem' }}>
                  Pagamento Online em Breve
                </h3>
                <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
                  Estamos configurando nossa plataforma de pagamentos segura.
                  Em breve você poderá pagar diretamente por aqui com cartão de crédito ou PIX.
                </p>
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '0.78rem', color: styles.sidebarWidgetText?.color,
                background: styles.background,
                border: `1px solid ${styles.borderColor}`,
                borderRadius: '8px', padding: '8px 14px',
              }}>
                <Lock size={13} />
                Pagamento processado com criptografia de ponta a ponta
              </div>

              <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>
                Para efetuar pagamentos agora, entre em contato com o petshop:
              </p>
              <a
                href="tel:+552197128-2945"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 20px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, hsl(262,80%,58%), hsl(262,80%,48%))',
                  color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem',
                  boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
                }}
              >
                📞 (21) 97128-2945
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
