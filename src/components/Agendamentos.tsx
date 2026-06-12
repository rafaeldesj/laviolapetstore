import React, { useState, useEffect } from 'react';
import { CalendarDays, Clock, PlusCircle, Trash2, Check, Play, X, User, PawPrint, Save } from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured, roleHierarchy, logAction } from '../supabaseClient';
import type { Appointment } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';

interface AgendamentosProps {
  currentUser: AuthUser;
  styles: any;
  setActiveSection: (section: string) => void;
}

const statusBadgeColors: Record<string, { bg: string; text: string; border: string }> = {
  'Agendado': { bg: 'rgba(54, 162, 235, 0.08)', text: 'hsl(210, 85%, 45%)', border: 'rgba(54, 162, 235, 0.25)' },
  'Em Andamento': { bg: 'rgba(255, 206, 86, 0.08)', text: 'hsl(36, 95%, 45%)', border: 'rgba(255, 206, 86, 0.25)' },
  'Concluído': { bg: 'rgba(75, 192, 192, 0.08)', text: 'hsl(142, 60%, 40%)', border: 'rgba(75, 192, 192, 0.25)' },
  'Cancelado': { bg: 'rgba(255, 99, 132, 0.08)', text: 'hsl(0, 75%, 55%)', border: 'rgba(255, 99, 132, 0.25)' },
};

const serviceIcons: Record<string, React.ReactNode> = {
  'Banho & Tosa': <PawPrint size={18} />,
  'Consulta Veterinária': <CalendarDays size={18} />,
  'Vacinação': <Check size={18} />,
  'Hotelzinho / Creche': <Clock size={18} />,
  'Outro': <PlusCircle size={18} />,
};

export const Agendamentos: React.FC<AgendamentosProps> = ({ currentUser, styles, setActiveSection }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<any[]>([]);
  const [allPets, setAllPets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [selectedPetId, setSelectedPetId] = useState<string>('');
  const [serviceType, setServiceType] = useState<string>('Banho & Tosa');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Filters
  const [filterPeriod, setFilterPeriod] = useState<string>('proximos'); // 'hoje' | 'proximos' | 'passados' | 'todos'
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Interactive states
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  
  // Staff Mode Logic
  const actualRole = currentUser?.profile?.role;
  const hasRealStaffRole = actualRole ? roleHierarchy[actualRole] >= roleHierarchy['collaborator'] : false;
  const [simulateStaff, setSimulateStaff] = useState<boolean>(true);
  
  const isStaffMode = hasRealStaffRole || (simulateStaff && !isSupabaseConfigured);

  useEffect(() => {
    fetchAppointments();
    fetchPets();
  }, [currentUser.id, isStaffMode]);

  const fetchAppointments = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (isSupabaseConfigured && supabase) {
        let query = supabase.from('appointments').select('*, pets(*)');
        if (!isStaffMode) {
          query = query.eq('owner_id', currentUser.id);
        }
        const { data, error } = await query.order('scheduled_at', { ascending: true });
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
        const { data } = await mockSupabaseDb.getAppointments(currentUser.id, isStaffMode);
        setAppointments(data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar agendamentos.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPets = async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        if (isStaffMode) {
          const { data: petsData, error: petsError } = await supabase.from('pets').select('*');
          if (petsError) throw petsError;

          let profilesData: any[] = [];
          try {
            const { data: profs, error: profsError } = await supabase.from('profiles').select('id, full_name, email');
            if (!profsError && profs) {
              profilesData = profs;
            }
          } catch (pErr) {
            console.warn('Erro ao carregar perfis em fetchPets:', pErr);
          }

          const mapped = (petsData || []).map((p: any) => {
            const profile = profilesData.find((prof: any) => prof.id === p.owner_id);
            return {
              ...p,
              tutor_name: profile?.full_name || 'Desconhecido',
              tutor_email: profile?.email || '',
            };
          });
          setAllPets(mapped);
        } else {
          const { data, error } = await supabase.from('pets').select('*').eq('owner_id', currentUser.id);
          if (error) throw error;
          setPets(data || []);
        }
      } else {
        if (isStaffMode) {
          const { data: pList } = await mockSupabaseDb.getAllPets();
          const mockUsers = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
          const mapped = (pList || []).map((p: any) => {
            const user = mockUsers.find((u: any) => u.id === p.owner_id);
            return {
              ...p,
              tutor_name: user?.name || 'Desconhecido',
              tutor_email: user?.email || '',
            };
          });
          setAllPets(mapped);
        } else {
          const { data } = await mockSupabaseDb.getPets(currentUser.id);
          setPets(data || []);
        }
      }
    } catch (err: any) {
      console.error('Erro ao buscar pets:', err);
      setErrorMsg(err.message || 'Erro ao carregar lista de pets.');
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPetId || !scheduledDate || !scheduledTime || !serviceType) {
      setErrorMsg('Preencha todos os campos obrigatórios.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);

    let petName = '';
    let ownerId = currentUser.id;

    if (isStaffMode) {
      const selectedPet = allPets.find(p => p.id === selectedPetId);
      if (selectedPet) {
        petName = selectedPet.name;
        ownerId = selectedPet.owner_id;
      }
    } else {
      const selectedPet = pets.find(p => p.id === selectedPetId);
      if (selectedPet) {
        petName = selectedPet.name;
      }
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    const newAppointmentData = {
      pet_id: selectedPetId,
      pet_name: petName || 'Pet',
      owner_id: ownerId,
      service_type: serviceType,
      scheduled_at: scheduledAt,
      status: 'Agendado' as const,
      notes: notes.trim(),
    };

    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('appointments').insert(newAppointmentData);
        if (error) throw error;
      } else {
        await mockSupabaseDb.addAppointment(newAppointmentData);
      }
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Tutor',
        'Novo Agendamento',
        `Agendamento de "${serviceType}" para o pet "${petName || 'Pet'}" em ${scheduledDate} às ${scheduledTime}.`
      );
      setSelectedPetId('');
      setScheduledDate('');
      setScheduledTime('');
      setNotes('');
      setIsAdding(false);
      fetchAppointments();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar agendamento.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (appointmentId: string, newStatus: 'Agendado' | 'Em Andamento' | 'Concluído' | 'Cancelado') => {
    setIsLoading(true);
    setErrorMsg(null);
    const appToUpdate = appointments.find(a => a.id === appointmentId);
    const petName = appToUpdate ? appToUpdate.pet_name : 'Pet';
    const service = appToUpdate ? appToUpdate.service_type : 'Serviço';
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('appointments')
          .update({ status: newStatus })
          .eq('id', appointmentId);
        if (error) throw error;
      } else {
        await mockSupabaseDb.updateAppointment(appointmentId, { status: newStatus });
      }
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Usuário',
        'Atualização de Agendamento',
        `O status do agendamento de "${service}" para o pet "${petName}" foi alterado para "${newStatus}".`
      );
      fetchAppointments();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar status.');
      setIsLoading(false);
    }
  };

  const handleCancel = async (appointmentId: string) => {
    if (!confirm('Deseja realmente cancelar este agendamento?')) return;
    await handleUpdateStatus(appointmentId, 'Cancelado');
  };

  const handleDelete = async (appointmentId: string) => {
    if (!confirm('Deseja remover definitivamente este agendamento do histórico?')) return;
    setIsLoading(true);
    setErrorMsg(null);
    const appToDelete = appointments.find(a => a.id === appointmentId);
    const petName = appToDelete ? appToDelete.pet_name : 'Pet';
    const service = appToDelete ? appToDelete.service_type : 'Serviço';
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('appointments').delete().eq('id', appointmentId);
        if (error) throw error;
      } else {
        await mockSupabaseDb.deleteAppointment(appointmentId);
      }
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Usuário',
        'Exclusão de Agendamento',
        `O agendamento de "${service}" para o pet "${petName}" (ID: ${appointmentId}) foi removido permanentemente.`
      );
      fetchAppointments();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao remover agendamento.');
      setIsLoading(false);
    }
  };

  const getTodayDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const datePart = d.toLocaleDateString('pt-BR');
      const timePart = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${datePart} às ${timePart}`;
    } catch {
      return isoString;
    }
  };

  const filteredAppointments = appointments.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    
    const appDate = new Date(a.scheduled_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (filterPeriod === 'hoje') {
      return appDate >= today && appDate < tomorrow;
    } else if (filterPeriod === 'proximos') {
      return appDate >= today;
    } else if (filterPeriod === 'passados') {
      return appDate < today;
    }
    return true;
  });

  const activePetsList = isStaffMode ? allPets : pets;

  return (
    <section style={styles.contentSection} aria-labelledby="agendamentos-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="agendamentos-heading" style={styles.sectionTitle}>
            <CalendarDays size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Agendamentos
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            {isStaffMode 
              ? 'Painel Geral de Agendamentos (Visão Administrativa)' 
              : 'Gerencie os agendamentos dos seus pets de forma prática.'
            }
          </p>
          {!isSupabaseConfigured && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: styles.secondary, fontWeight: 600 }}>
                * Modo Demonstração Local
              </span>
              {!hasRealStaffRole && (
                <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: styles.primary, fontWeight: 600 }}>
                  <input 
                    type="checkbox" 
                    checked={simulateStaff} 
                    onChange={(e) => setSimulateStaff(e.target.checked)} 
                  />
                  Simular Visão de Equipe
                </label>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setIsAdding(true)}
          style={styles.btnAcc(hoveredBtn === 'new-app')}
          onMouseEnter={() => setHoveredBtn('new-app')}
          onMouseLeave={() => setHoveredBtn(null)}
        >
          <PlusCircle size={16} /> Agendar Serviço
        </button>
      </div>

      {errorMsg && (
        <div style={{ color: 'red', fontSize: '0.9rem', margin: '15px 0' }}>
          {errorMsg}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginTop: '25px', borderBottom: `1px solid ${styles.borderColor}`, paddingBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'hoje', label: 'Hoje' },
            { id: 'proximos', label: 'Próximos' },
            { id: 'passados', label: 'Histórico' },
            { id: 'todos', label: 'Todos' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterPeriod(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: filterPeriod === tab.id ? `3px solid ${styles.primary}` : '3px solid transparent',
                color: filterPeriod === tab.id ? styles.primary : styles.sidebarWidgetText?.color,
                fontWeight: 600,
                fontSize: '0.88rem',
                padding: '8px 12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isStaffMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color, fontWeight: 600 }}>Filtrar Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ ...styles.formInput, padding: '6px 10px', fontSize: '0.82rem', width: 'auto' }}
            >
              <option value="all">Todos</option>
              <option value="Agendado">Agendados</option>
              <option value="Em Andamento">Em Andamento</option>
              <option value="Concluído">Concluídos</option>
              <option value="Cancelado">Cancelados</option>
            </select>
          </div>
        )}
      </div>

      {isLoading && filteredAppointments.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, marginTop: '20px' }}>Carregando agendamentos...</p>
      ) : filteredAppointments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: `2px dashed ${styles.borderColor}`, borderRadius: '12px', marginTop: '20px' }}>
          <Clock size={40} style={{ color: styles.secondary, margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: styles.sidebarWidgetText?.color, fontWeight: 500 }}>
            Nenhum agendamento encontrado para este período.
          </p>
        </div>
      ) : (
        <div style={{ ...styles.crudList, marginTop: '20px' }}>
          {filteredAppointments.map((app) => {
            const badge = statusBadgeColors[app.status] || { bg: '#eee', text: '#333', border: '#ddd' };
            const isPending = app.status === 'Agendado';
            const isInProgress = app.status === 'Em Andamento';

            return (
              <article key={app.id} style={{ ...styles.petCard, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ color: styles.primary }}>
                      {serviceIcons[app.service_type] || <PlusCircle size={18} />}
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: styles.textMain }}>
                      {app.service_type}
                    </h3>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '20px',
                    backgroundColor: badge.bg,
                    color: badge.text,
                    border: `1px solid ${badge.border}`,
                  }}>
                    {app.status}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0 0 0' }}>
                  <div style={{ fontSize: '0.88rem', color: styles.textMain }}>
                    Pet: <strong>{app.pet_name}</strong>
                  </div>
                  {isStaffMode && app.owner_id && (
                    <div style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={12} />
                      Tutor ID/Email: <span style={{ fontFamily: 'monospace' }}>{app.owner_id.substring(0, 8)}...</span>
                    </div>
                  )}
                  <div style={{ fontSize: '0.88rem', color: styles.textMain, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <Clock size={14} style={{ color: styles.primary }} />
                    <span>{formatDate(app.scheduled_at)}</span>
                  </div>
                  {app.notes && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '8px 10px', 
                      borderRadius: '6px', 
                      backgroundColor: styles.background, 
                      fontSize: '0.8rem', 
                      color: styles.sidebarWidgetText?.color,
                      borderLeft: `3px solid ${styles.borderColor}`
                    }}>
                      {app.notes}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  gap: '8px', 
                  marginTop: '12px', 
                  borderTop: `1px solid ${styles.borderColor}`,
                  paddingTop: '12px'
                }}>
                  {isStaffMode ? (
                    <>
                      {isPending && (
                        <button
                          onClick={() => handleUpdateStatus(app.id, 'Em Andamento')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            background: 'none', border: `1px solid ${styles.secondary}`, borderRadius: '6px',
                            padding: '4px 8px', fontSize: '0.78rem', color: styles.secondary, cursor: 'pointer',
                            fontWeight: 600, transition: 'all 0.2s'
                          }}
                          title="Iniciar Atendimento"
                        >
                          <Play size={12} /> Iniciar
                        </button>
                      )}
                      {isInProgress && (
                        <button
                          onClick={() => handleUpdateStatus(app.id, 'Concluído')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            background: 'none', border: '1px solid hsl(142, 60%, 40%)', borderRadius: '6px',
                            padding: '4px 8px', fontSize: '0.78rem', color: 'hsl(142, 60%, 40%)', cursor: 'pointer',
                            fontWeight: 600, transition: 'all 0.2s'
                          }}
                          title="Concluir Atendimento"
                        >
                          <Check size={12} /> Concluir
                        </button>
                      )}
                      {(isPending || isInProgress) && (
                        <button
                          onClick={() => handleUpdateStatus(app.id, 'Cancelado')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            background: 'none', border: '1px solid hsl(0, 75%, 55%)', borderRadius: '6px',
                            padding: '4px 8px', fontSize: '0.78rem', color: 'hsl(0, 75%, 55%)', cursor: 'pointer',
                            fontWeight: 600, transition: 'all 0.2s'
                          }}
                          title="Cancelar Agendamento"
                        >
                          <X size={12} /> Cancelar
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(app.id)}
                        style={styles.btnIcon(hoveredBtn === `del-${app.id}`, true)}
                        onMouseEnter={() => setHoveredBtn(`del-${app.id}`)}
                        onMouseLeave={() => setHoveredBtn(null)}
                        title="Remover Registro"
                        aria-label="Remover agendamento do histórico"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : (
                    isPending && (
                      <button
                        onClick={() => handleCancel(app.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          background: 'none', border: '1px solid hsl(0, 75%, 55%)', borderRadius: '6px',
                          padding: '6px 12px', fontSize: '0.8rem', color: 'hsl(0, 75%, 55%)', cursor: 'pointer',
                          fontWeight: 600, transition: 'all 0.2s'
                        }}
                      >
                        <X size={14} /> Cancelar Agendamento
                      </button>
                    )
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Booking Dialog Modal */}
      {isAdding && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '500px' }} role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
            <div style={styles.modalHeader}>
              <h2 id="booking-modal-title" style={styles.modalTitle}>Novo Agendamento</h2>
              <button onClick={() => setIsAdding(false)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            {activePetsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <PawPrint size={32} style={{ color: styles.secondary, margin: '0 auto 10px', display: 'block' }} />
                <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.9rem', marginBottom: '15px' }}>
                  {isStaffMode 
                    ? 'Nenhum pet cadastrado no petshop ainda para realizar agendamentos.' 
                    : 'Você precisa cadastrar pelo menos um pet antes de realizar um agendamento.'
                  }
                </p>
                {!isStaffMode && (
                  <button 
                    onClick={() => { setIsAdding(false); setActiveSection('pets'); }}
                    style={{ ...styles.btnAcc(false), margin: '0 auto' }}
                  >
                    Cadastrar Pet
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSchedule} style={styles.modalForm}>
                <div style={styles.formGroup}>
                  <label htmlFor="book-pet" style={styles.formLabel}>Selecione o Pet *</label>
                  <select
                    id="book-pet"
                    value={selectedPetId}
                    onChange={(e) => setSelectedPetId(e.target.value)}
                    style={styles.formInput}
                    required
                  >
                    <option value="">Selecione...</option>
                    {activePetsList.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.species}){isStaffMode ? ` - Tutor: ${p.tutor_name} (${p.tutor_email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="book-service" style={styles.formLabel}>Serviço *</label>
                  <select
                    id="book-service"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    style={styles.formInput}
                    required
                  >
                    <option value="Banho & Tosa">Banho & Tosa Especializado</option>
                    <option value="Consulta Veterinária">Consulta Veterinária</option>
                    <option value="Vacinação">Vacinação / Prevenção</option>
                    <option value="Hotelzinho / Creche">Hotelzinho & Creche</option>
                    <option value="Outro">Outro Serviço</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div style={styles.formGroup}>
                    <label htmlFor="book-date" style={styles.formLabel}>Data *</label>
                    <input
                      id="book-date"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      style={styles.formInput}
                      min={getTodayDateString()}
                      required
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label htmlFor="book-time" style={styles.formLabel}>Horário *</label>
                    <input
                      id="book-time"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      style={styles.formInput}
                      required
                    />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="book-notes" style={styles.formLabel}>Observações / Instruções</label>
                  <textarea
                    id="book-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ ...styles.formInput, minHeight: '80px', resize: 'vertical' }}
                    placeholder="Ex: Alérgico a shampoo de coco, comportamento agitado..."
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button
                    type="submit"
                    style={{ ...styles.formSubmitBtn(false), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexGrow: 1, margin: 0 }}
                  >
                    <Save size={16} /> Confirmar Agendamento
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    style={{ ...styles.btnAcc(false), padding: '12px' }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

