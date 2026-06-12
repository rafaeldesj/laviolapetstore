import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, CalendarDays, Clock, CheckCircle2, XCircle,
  AlertCircle, Loader2, PawPrint, RefreshCw, ChevronRight,
  Lock, ShieldCheck, QrCode, Landmark, Smartphone, X
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
  'Agendado':     { bg: 'rgba(54,162,235,0.08)',  text: 'hsl(210,85%,45%)', border: 'rgba(54,162,235,0.25)',  icon: <Clock size={12} />,         label: 'Agendado' },
  'Em Andamento': { bg: 'rgba(255,206,86,0.08)',  text: 'hsl(36,95%,45%)',  border: 'rgba(255,206,86,0.25)',  icon: <Loader2 size={12} />,       label: 'Em Andamento' },
  'Concluído':    { bg: 'rgba(75,192,192,0.08)',  text: 'hsl(142,60%,40%)', border: 'rgba(75,192,192,0.25)',  icon: <CheckCircle2 size={12} />,  label: 'Concluído' },
  'Cancelado':    { bg: 'rgba(255,99,132,0.08)',  text: 'hsl(0,75%,55%)',   border: 'rgba(255,99,132,0.25)',  icon: <XCircle size={12} />,       label: 'Cancelado' },
};

const paymentMethods = [
  {
    id: 'pix',
    icon: <QrCode size={24} />,
    label: 'PIX',
    description: 'Pagamento instantâneo via QR Code',
    available: true,
    color: 'hsl(160,60%,40%)',
    bg: 'rgba(75,192,150,0.08)',
    border: 'rgba(75,192,150,0.3)',
  },
  {
    id: 'credito',
    icon: <CreditCard size={24} />,
    label: 'Cartão de Crédito',
    description: 'Em até 12x sem juros • Em breve',
    available: false,
    color: 'hsl(262,80%,58%)',
    bg: 'rgba(139,92,246,0.06)',
    border: 'rgba(139,92,246,0.2)',
  },
  {
    id: 'debito',
    icon: <Landmark size={24} />,
    label: 'Cartão de Débito',
    description: 'Débito à vista • Em breve',
    available: false,
    color: 'hsl(210,85%,45%)',
    bg: 'rgba(54,162,235,0.06)',
    border: 'rgba(54,162,235,0.2)',
  },
  {
    id: 'link',
    icon: <Smartphone size={24} />,
    label: 'Link de Pagamento',
    description: 'Receba no WhatsApp ou e-mail • Em breve',
    available: false,
    color: 'hsl(36,95%,45%)',
    bg: 'rgba(255,206,86,0.06)',
    border: 'rgba(255,206,86,0.2)',
  },
];

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
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
    if (a.status === 'Cancelado') return false;
    if (activeTab === 'concluidos') return a.status === 'Concluído';
    if (activeTab === 'agendados')  return a.status === 'Agendado' || a.status === 'Em Andamento';
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Reset payment panel when selection changes
    setShowPaymentMethods(false);
    setSelectedMethod(null);
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(a => a.id)));
    }
    setShowPaymentMethods(false);
    setSelectedMethod(null);
  };

  const selectedAppointments = appointments.filter(a => selectedIds.has(a.id));
  const selectedTotal = selectedAppointments.reduce(
    (sum, a) => sum + (serviceValueMap[a.service_type] || 70), 0
  );

  const totalEstimado = appointments
    .filter(a => a.status !== 'Cancelado')
    .reduce((sum, a) => sum + (serviceValueMap[a.service_type] || 70), 0);

  const tabs = [
    { id: 'todos',      label: 'Todos os Serviços' },
    { id: 'agendados',  label: 'Próximos' },
    { id: 'concluidos', label: 'Realizados' },
  ] as const;

  return (
    <section style={styles.contentSection} aria-labelledby="pagamentos-heading">

      {/* ── Header ── */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="pagamentos-heading" style={styles.sectionTitle}>
            <CreditCard size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Meus Pagamentos
            <div style={styles.sectionTitleBar} />
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Selecione os serviços e avance para o pagamento de forma segura.
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
          <RefreshCw size={14} />
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

      {/* ── Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px', boxShadow: styles.shadow,
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(54,162,235,0.1)', color: 'hsl(210,85%,45%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarDays size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>Total de Serviços</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: styles.textMain }}>
              {appointments.filter(a => a.status !== 'Cancelado').length}
            </strong>
          </div>
        </div>

        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${appointments.some(a => a.status === 'Concluído') ? 'rgba(75,192,192,0.3)' : styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px', boxShadow: styles.shadow,
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(75,192,192,0.1)', color: 'hsl(142,60%,40%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>Realizados</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: 'hsl(142,60%,40%)' }}>
              {appointments.filter(a => a.status === 'Concluído').length}
            </strong>
          </div>
        </div>

        <div style={{
          background: styles.cardBackground || styles.background,
          border: `1px solid ${totalEstimado > 0 ? 'rgba(139,92,246,0.3)' : styles.borderColor}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px', boxShadow: styles.shadow,
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(139,92,246,0.1)', color: 'hsl(262,80%,58%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>Valor Total Est.</span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: 'hsl(262,80%,58%)' }}>
              R$ {totalEstimado.toFixed(2)}
            </strong>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '4px', marginTop: '28px', borderBottom: `1px solid ${styles.borderColor}` }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedIds(new Set()); setShowPaymentMethods(false); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: 600, fontSize: '0.88rem', padding: '8px 16px',
              color: activeTab === tab.id ? styles.primary : styles.sidebarWidgetText?.color,
              borderBottom: activeTab === tab.id ? `3px solid ${styles.primary}` : '3px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── Select All row ── */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', padding: '0 4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={toggleAll}
              style={{ width: '17px', height: '17px', accentColor: styles.primary, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: styles.sidebarWidgetText?.color }}>
              Selecionar todos ({filtered.length})
            </span>
          </label>
          {selectedIds.size > 0 && (
            <span style={{ fontSize: '0.82rem', color: 'hsl(262,80%,58%)', fontWeight: 700 }}>
              {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''} · R$ {selectedTotal.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* ── Service List ── */}
      {isLoading && filtered.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, marginTop: '30px', textAlign: 'center' }}>Carregando serviços…</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', marginTop: '20px', border: `1px dashed ${styles.borderColor}`, borderRadius: '12px' }}>
          <PawPrint size={40} style={{ color: styles.secondary, margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
          <p style={{ color: styles.sidebarWidgetText?.color, fontWeight: 500 }}>Nenhum serviço encontrado para este filtro.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          {filtered.map(app => {
            const st = statusConfig[app.status] || statusConfig['Agendado'];
            const valor = serviceValueMap[app.service_type] || 70;
            const isChecked = selectedIds.has(app.id);

            return (
              <label
                key={app.id}
                htmlFor={`chk-${app.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  background: isChecked
                    ? `linear-gradient(135deg, rgba(139,92,246,0.07), rgba(139,92,246,0.03))`
                    : (styles.cardBackground || styles.background),
                  border: `1.5px solid ${isChecked ? 'hsl(262,80%,58%)' : styles.borderColor}`,
                  borderRadius: '12px', padding: '14px 18px',
                  boxShadow: isChecked ? '0 0 0 3px rgba(139,92,246,0.12)' : styles.shadow,
                  cursor: 'pointer', transition: 'all 0.18s ease',
                  flexWrap: 'wrap',
                }}
              >
                {/* Checkbox */}
                <input
                  id={`chk-${app.id}`}
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleSelect(app.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '18px', height: '18px', accentColor: 'hsl(262,80%,58%)', cursor: 'pointer', flexShrink: 0 }}
                />

                {/* Ícone */}
                <div style={{
                  width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                  background: isChecked ? 'rgba(139,92,246,0.12)' : 'rgba(54,162,235,0.08)',
                  color: isChecked ? 'hsl(262,80%,58%)' : styles.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CalendarDays size={18} />
                </div>

                {/* Info */}
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.97rem', color: styles.textMain }}>{app.service_type}</strong>
                    <span style={{
                      fontSize: '0.67rem', fontWeight: 700, padding: '2px 7px',
                      borderRadius: '20px', backgroundColor: st.bg, color: st.text,
                      border: `1px solid ${st.border}`, display: 'flex', alignItems: 'center', gap: '3px',
                    }}>
                      {st.icon} {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color, marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <span>🐾 {app.pet_name}</span>
                    <span>📅 {formatDate(app.scheduled_at)}</span>
                  </div>
                </div>

                {/* Valor */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color, display: 'block' }}>Valor est.</span>
                  <strong style={{ fontSize: '1.1rem', color: isChecked ? 'hsl(262,80%,58%)' : styles.textMain }}>
                    R$ {valor.toFixed(2)}
                  </strong>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* ── Barra de Total + Botão Seguir ── */}
      {selectedIds.size > 0 && (
        <div style={{
          marginTop: '20px',
          background: `linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.05))`,
          border: '1.5px solid rgba(139,92,246,0.3)',
          borderRadius: '14px',
          padding: '18px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '14px',
          boxShadow: '0 4px 20px rgba(139,92,246,0.15)',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: styles.sidebarWidgetText?.color, fontWeight: 600 }}>
              {selectedIds.size} serviço{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>Total estimado:</span>
              <strong style={{ fontSize: '1.5rem', color: 'hsl(262,80%,58%)' }}>R$ {selectedTotal.toFixed(2)}</strong>
            </div>
          </div>

          <button
            onClick={() => { setShowPaymentMethods(true); setSelectedMethod(null); }}
            onMouseEnter={() => setHoveredBtn('seguir')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px', borderRadius: '10px', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
              fontSize: '0.95rem', transition: 'all 0.2s',
              background: hoveredBtn === 'seguir'
                ? 'linear-gradient(135deg, hsl(262,80%,48%), hsl(262,80%,38%))'
                : 'linear-gradient(135deg, hsl(262,80%,58%), hsl(262,80%,48%))',
              color: '#fff',
              boxShadow: hoveredBtn === 'seguir'
                ? '0 6px 20px rgba(139,92,246,0.5)'
                : '0 4px 14px rgba(139,92,246,0.35)',
              transform: hoveredBtn === 'seguir' ? 'translateY(-1px)' : 'none',
            }}
          >
            Seguir para Pagamento <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ── Formas de Pagamento (inline) ── */}
      {showPaymentMethods && selectedIds.size > 0 && (
        <div style={{
          marginTop: '16px',
          background: styles.cardBackground || styles.background,
          border: `1px solid ${styles.borderColor}`,
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: styles.shadow,
        }}>
          {/* Header da seção */}
          <div style={{
            padding: '16px 22px',
            borderBottom: `1px solid ${styles.borderColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={20} style={{ color: 'hsl(142,60%,40%)' }} />
              <div>
                <strong style={{ fontSize: '1rem', color: styles.textMain, display: 'block' }}>
                  Escolha a forma de pagamento
                </strong>
                <span style={{ fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>
                  Total a pagar: <strong style={{ color: 'hsl(262,80%,58%)' }}>R$ {selectedTotal.toFixed(2)}</strong>
                </span>
              </div>
            </div>
            <button
              onClick={() => { setShowPaymentMethods(false); setSelectedMethod(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: styles.sidebarWidgetText?.color, padding: '4px' }}
              aria-label="Fechar formas de pagamento"
            >
              <X size={18} />
            </button>
          </div>

          {/* Grid de métodos */}
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {paymentMethods.map(method => (
              <button
                key={method.id}
                onClick={() => method.available && setSelectedMethod(method.id)}
                disabled={!method.available}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: '8px', padding: '16px', borderRadius: '12px', cursor: method.available ? 'pointer' : 'not-allowed',
                  border: `1.5px solid ${selectedMethod === method.id ? method.color : method.border}`,
                  background: selectedMethod === method.id
                    ? method.bg.replace('0.08', '0.18').replace('0.06', '0.14')
                    : method.bg,
                  boxShadow: selectedMethod === method.id ? `0 0 0 3px ${method.bg}` : 'none',
                  transition: 'all 0.18s ease', textAlign: 'left', fontFamily: 'inherit',
                  opacity: method.available ? 1 : 0.55,
                  position: 'relative',
                }}
              >
                {!method.available && (
                  <span style={{
                    position: 'absolute', top: '8px', right: '8px',
                    fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px',
                    borderRadius: '20px', background: 'rgba(120,120,120,0.12)',
                    color: styles.sidebarWidgetText?.color, textTransform: 'uppercase',
                  }}>
                    Em breve
                  </span>
                )}
                <div style={{ color: method.color }}>{method.icon}</div>
                <strong style={{ fontSize: '0.9rem', color: styles.textMain }}>{method.label}</strong>
                <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, lineHeight: 1.4 }}>
                  {method.description}
                </span>
                {selectedMethod === method.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <CheckCircle2 size={14} style={{ color: method.color }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: method.color }}>Selecionado</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Aviso de segurança + ação */}
          <div style={{ padding: '14px 22px', borderTop: `1px solid ${styles.borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>
              <Lock size={13} /> Ambiente seguro · Dados criptografados
            </div>

            {selectedMethod === 'pix' ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px', borderRadius: '10px',
                background: 'rgba(75,192,150,0.08)', border: '1px solid rgba(75,192,150,0.3)',
              }}>
                <QrCode size={18} style={{ color: 'hsl(160,60%,40%)' }} />
                <div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'hsl(160,60%,40%)', display: 'block' }}>
                    PIX — em configuração
                  </span>
                  <span style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color }}>
                    Entre em contato: <strong>(21) 97128-2945</strong>
                  </span>
                </div>
              </div>
            ) : selectedMethod ? (
              <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                Esta forma de pagamento estará disponível em breve.
              </span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
                Selecione uma forma de pagamento acima.
              </span>
            )}
          </div>
        </div>
      )}

    </section>
  );
};
