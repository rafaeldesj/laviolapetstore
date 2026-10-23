import React, { useState, useEffect } from 'react';
import { CalendarDays, Clock, PlusCircle, Trash2, Check, Play, X, User, PawPrint, Save, Upload, Download, ChevronLeft, ChevronRight, AlertCircle, Info } from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured, roleHierarchy, logAction } from '../supabaseClient';
import type { Appointment } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';
import { listAppointments, createAppointment, updateAppointmentApi, deleteAppointmentApi } from '../utils/agendaService';
import type { AgendaScope } from '../utils/agendaService';

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

  // Calendar states
  const [viewMode, setViewMode] = useState<'list' | 'week' | 'day'>('list');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedCalendarApp, setSelectedCalendarApp] = useState<Appointment | null>(null);
  
  const [profilesList, setProfilesList] = useState<any[]>([]);
  // Edição / escolha de "só este dia ou a série toda" / pet sem cadastro / repetição semanal
  const [editingApp, setEditingApp] = useState<Appointment | null>(null);
  const [editScope, setEditScope] = useState<AgendaScope>('this');
  const [scopeAsk, setScopeAsk] = useState<{ id: string } | null>(null);
  const [manualPet, setManualPet] = useState<string>('');
  const [manualTutor, setManualTutor] = useState<string>('');
  const [repeatWeekly, setRepeatWeekly] = useState<boolean>(false);
  const [repeatCount, setRepeatCount] = useState<string>('4');

  useEffect(() => {
    if (isStaffMode) {
      setViewMode('week');
    } else {
      setViewMode('list');
    }
  }, [isStaffMode]);

  useEffect(() => {
    fetchPets();
  }, [currentUser.id, isStaffMode]);

  // A agenda é lida só do período que está na tela (semana, dia ou a lista escolhida)
  const DAY_MS = 86400000;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const rangeForView = (): [Date, Date] => {
    const today = startOfDay(new Date());
    if (viewMode === 'week') {
      const days = getWeekDays(currentDate);
      return [startOfDay(days[0]), new Date(startOfDay(days[days.length - 1]).getTime() + DAY_MS)];
    }
    if (viewMode === 'day') {
      const d = startOfDay(currentDate);
      return [d, new Date(d.getTime() + DAY_MS)];
    }
    if (filterPeriod === 'hoje') return [today, new Date(today.getTime() + DAY_MS)];
    if (filterPeriod === 'proximos') return [today, new Date(today.getTime() + 120 * DAY_MS)];
    if (filterPeriod === 'passados') return [new Date(today.getTime() - 365 * DAY_MS), today];
    return [new Date(today.getTime() - 365 * DAY_MS), new Date(today.getTime() + 365 * DAY_MS)];
  };

  const fetchAppointments = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMsg(null);
    try {
      const [from, to] = rangeForView();
      setAppointments(await listAppointments(from, to));
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar agendamentos.');
    } finally {
      setIsLoading(false);
    }
  };

  const periodKey = `${viewMode}|${filterPeriod}|${viewMode === 'list' ? '' : startOfDay(currentDate).getTime()}`;
  useEffect(() => {
    fetchAppointments();
  }, [currentUser.id, isStaffMode, periodKey]);

  // Se outra pessoa mexer na agenda, a tela se atualiza sozinha (a cada 60 segundos, com a tela aberta)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAppointments(true);
    }, 60000);
    return () => clearInterval(timer);
  }, [currentUser.id, isStaffMode, periodKey]);

  const fetchPets = async () => {
    try {
      if (false && supabase) {
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
          setProfilesList(profilesData);

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
          setProfilesList(mockUsers.map((u: any) => ({ id: u.id, full_name: u.name, email: u.email })));
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

  // Helper names & Navigation/Formatting Helpers
  const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const getWeekDays = (date: Date): Date[] => {
    const result: Date[] = [];
    const current = new Date(date);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1); // Monday
    current.setDate(diff);
    for (let i = 0; i < 6; i++) { // Monday to Saturday
      result.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return result;
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const getWeekLabel = (date: Date) => {
    const days = getWeekDays(date);
    const start = days[0];
    const end = days[days.length - 1];
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} a ${end.getDate()} de ${monthNames[start.getMonth()]} de ${start.getFullYear()}`;
    } else if (start.getFullYear() === end.getFullYear()) {
      return `${start.getDate()} de ${monthNames[start.getMonth()]} a ${end.getDate()} de ${monthNames[end.getMonth()]} de ${start.getFullYear()}`;
    } else {
      return `${start.getDate()} de ${monthNames[start.getMonth()]} de ${start.getFullYear()} a ${end.getDate()} de ${monthNames[end.getMonth()]} de ${end.getFullYear()}`;
    }
  };

  const getDayLabel = (date: Date) => {
    return `${weekdayNames[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()]} de ${date.getFullYear()}`;
  };

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handlePrevDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 1);
    if (newDate.getDay() === 0) {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    if (newDate.getDay() === 0) {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const hours = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'
  ];

  const getAppointmentsForSlot = (day: Date, hourStr: string) => {
    const cellYear = day.getFullYear();
    const cellMonth = day.getMonth();
    const cellDate = day.getDate();
    const cellHour = parseInt(hourStr.split(':')[0], 10);
    
    return appointments.filter(app => {
      if (filterStatus !== 'all' && app.status !== filterStatus) return false;
      const appDate = new Date(app.scheduled_at);
      return appDate.getFullYear() === cellYear &&
             appDate.getMonth() === cellMonth &&
             appDate.getDate() === cellDate &&
             appDate.getHours() === cellHour;
    });
  };

  const handleCellClick = (day: Date, hourStr: string) => {
    const yyyy = day.getFullYear();
    const mm = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    setScheduledDate(`${yyyy}-${mm}-${dd}`);
    setScheduledTime(hourStr);
    setIsAdding(true);
  };

  const closeBooking = () => {
    setIsAdding(false);
    setEditingApp(null);
    setSelectedPetId('');
    setManualPet('');
    setManualTutor('');
    setRepeatWeekly(false);
    setRepeatCount('4');
    setNotes('');
    setScheduledDate('');
    setScheduledTime('');
  };

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const openEdit = (app: Appointment) => {
    const d = new Date(app.scheduled_at);
    setEditingApp(app);
    setEditScope('this');
    setServiceType(app.service_type);
    setScheduledDate(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    setScheduledTime(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
    setNotes(app.notes || '');
    setSelectedCalendarApp(null);
    setIsAdding(true);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const manual = selectedPetId === '__manual';
    if ((!editingApp && !selectedPetId) || (manual && !manualPet.trim()) || !scheduledDate || !scheduledTime || !serviceType) {
      setErrorMsg('Preencha todos os campos obrigatórios.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    const startISO = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

    try {
      if (editingApp) {
        await updateAppointmentApi(editingApp.id, { startISO, serviceType, notes: notes.trim() }, editingApp.recurringEventId ? editScope : 'this');
        await logAction(
          currentUser.email || '',
          currentUser.name || 'Usuário',
          'Edição de Agendamento',
          `Agendamento de "${serviceType}" do pet "${editingApp.pet_name}" alterado para ${scheduledDate} às ${scheduledTime}${editingApp.recurringEventId && editScope === 'series' ? ' (série inteira)' : ''}.`
        );
      } else {
        let petName = '';
        let petId = '';
        let tutorName = '';
        let ownerId = '';
        if (manual) {
          petName = manualPet.trim();
          tutorName = manualTutor.trim();
        } else if (isStaffMode) {
          const p = allPets.find(x => x.id === selectedPetId);
          if (p) {
            petName = p.name;
            petId = p.id;
            ownerId = p.owner_id;
            tutorName = p.tutor_name && p.tutor_name !== 'Desconhecido' ? p.tutor_name : '';
          }
        } else {
          const p = pets.find(x => x.id === selectedPetId);
          if (p) {
            petName = p.name;
            petId = p.id;
          }
          tutorName = currentUser.name || '';
        }
        const total = repeatWeekly ? Math.min(104, Math.max(2, parseInt(repeatCount, 10) || 2)) : 1;
        await createAppointment({
          petId,
          petName: petName || 'Pet',
          tutorName,
          ownerId: isStaffMode ? ownerId : undefined,
          serviceType,
          startISO,
          notes: notes.trim(),
          repeatCount: total,
        });
        await logAction(
          currentUser.email || '',
          currentUser.name || 'Tutor',
          'Novo Agendamento',
          `Agendamento de "${serviceType}" para o pet "${petName || 'Pet'}" em ${scheduledDate} às ${scheduledTime}${total > 1 ? `, repetindo toda semana (${total} vezes)` : ''}.`
        );
      }
      closeBooking();
      await fetchAppointments(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar o agendamento.');
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
      await updateAppointmentApi(appointmentId, { status: newStatus }, 'this');
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Usuário',
        'Atualização de Agendamento',
        `O status do agendamento de "${service}" para o pet "${petName}" foi alterado para "${newStatus}".`
      );
      await fetchAppointments(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar status.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async (appointmentId: string) => {
    if (!confirm('Deseja realmente cancelar este agendamento?')) return;
    await handleUpdateStatus(appointmentId, 'Cancelado');
  };

  const runDelete = async (appointmentId: string, scope: AgendaScope) => {
    setIsLoading(true);
    setErrorMsg(null);
    const appToDelete = appointments.find(a => a.id === appointmentId);
    const petName = appToDelete ? appToDelete.pet_name : 'Pet';
    const service = appToDelete ? appToDelete.service_type : 'Serviço';
    try {
      await deleteAppointmentApi(appointmentId, scope);
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Usuário',
        'Exclusão de Agendamento',
        `O agendamento de "${service}" para o pet "${petName}" foi removido${scope === 'series' ? ' (série inteira)' : ''}.`
      );
      await fetchAppointments(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao remover agendamento.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (appointmentId: string) => {
    const app = appointments.find(a => a.id === appointmentId);
    if (app?.recurringEventId) {
      setScopeAsk({ id: appointmentId }); // agendamento que se repete: pergunta se é só este dia ou todos
      return;
    }
    if (!confirm('Deseja remover definitivamente este agendamento?')) return;
    await runDelete(appointmentId, 'this');
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
            Banho e Tosa / Clubinho
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

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setIsAdding(true)}
            style={styles.btnAcc(hoveredBtn === 'new-app')}
            onMouseEnter={() => setHoveredBtn('new-app')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            <PlusCircle size={16} /> Agendar Serviço
          </button>
        </div>
      </div>

      <style>{`
        .calendar-slot-cell:hover {
          background-color: rgba(54, 162, 235, 0.05) !important;
        }
        .calendar-slot-cell:hover .cell-plus-indicator {
          opacity: 1 !important;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {errorMsg && (
        <div style={{ color: 'red', fontSize: '0.9rem', margin: '15px 0' }}>
          {errorMsg}
        </div>
      )}

      {/* Filter and View mode Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginTop: '25px', borderBottom: `1px solid ${styles.borderColor}`, paddingBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '4px', marginRight: '10px' }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                background: viewMode === 'list' ? styles.primary : 'none',
                border: viewMode === 'list' ? `1px solid ${styles.primary}` : `1px solid ${styles.borderColor}`,
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: viewMode === 'list' ? '#fff' : styles.textMain,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Lista
            </button>
            {isStaffMode && (
              <>
                <button
                  onClick={() => setViewMode('week')}
                  style={{
                    background: viewMode === 'week' ? styles.primary : 'none',
                    border: viewMode === 'week' ? `1px solid ${styles.primary}` : `1px solid ${styles.borderColor}`,
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: viewMode === 'week' ? '#fff' : styles.textMain,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Semana
                </button>
                <button
                  onClick={() => setViewMode('day')}
                  style={{
                    background: viewMode === 'day' ? styles.primary : 'none',
                    border: viewMode === 'day' ? `1px solid ${styles.primary}` : `1px solid ${styles.borderColor}`,
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: viewMode === 'day' ? '#fff' : styles.textMain,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Dia
                </button>
              </>
            )}
          </div>

          {viewMode === 'list' ? (
            // Period Tabs for List View
            <div style={{ display: 'flex', gap: '4px' }}>
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
                    fontSize: '0.82rem',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : (
            // Date Switcher for Calendar Views
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={viewMode === 'week' ? handlePrevWeek : handlePrevDay}
                style={{
                  background: styles.background,
                  border: `1px solid ${styles.borderColor}`,
                  borderRadius: '6px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: styles.textMain
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                style={{
                  background: styles.background,
                  border: `1px solid ${styles.borderColor}`,
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: styles.textMain
                }}
              >
                Hoje
              </button>
              <span style={{ fontWeight: 700, color: styles.textMain, fontSize: '0.88rem' }}>
                {viewMode === 'week' ? getWeekLabel(currentDate) : getDayLabel(currentDate)}
              </span>
              <button
                onClick={viewMode === 'week' ? handleNextWeek : handleNextDay}
                style={{
                  background: styles.background,
                  border: `1px solid ${styles.borderColor}`,
                  borderRadius: '6px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: styles.textMain
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
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

      {/* Render Main Content based on viewMode */}
      {viewMode === 'list' ? (
        isLoading && filteredAppointments.length === 0 ? (
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
                          className="btn-action-icon btn-action-danger"
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
        )
      ) : viewMode === 'week' ? (
        <div style={{ overflowX: 'auto', width: '100%', marginTop: '20px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px repeat(6, 1fr)',
            border: `1px solid ${styles.borderColor}`,
            borderRadius: '12px',
            overflow: 'hidden',
            backgroundColor: styles.cardBg,
            minWidth: '850px'
          }}>
            {/* Header row */}
            <div style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 600, borderBottom: `2px solid ${styles.borderColor}`, borderRight: `1px solid ${styles.borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: styles.textMuted, backgroundColor: styles.background, fontSize: '0.82rem' }}>
              Horário
            </div>
            {getWeekDays(currentDate).map((day) => {
              const active = isToday(day);
              return (
                <div key={day.toISOString()} style={{ padding: '10px 8px', textAlign: 'center', borderBottom: `2px solid ${styles.borderColor}`, borderRight: `1px solid ${styles.borderColor}`, backgroundColor: active ? 'rgba(54, 162, 235, 0.04)' : styles.background }}>
                  <div style={{ textTransform: 'capitalize', fontWeight: 700, color: active ? styles.primary : styles.textMain, fontSize: '0.9rem' }}>
                    {day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: active ? styles.secondary : styles.textMuted, fontWeight: 500, marginTop: '2px' }}>
                    {day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </div>
                </div>
              );
            })}

            {/* Hour rows */}
            {hours.map((hour) => {
              const weekDays = getWeekDays(currentDate);
              return (
                <React.Fragment key={hour}>
                  {/* Time label cell */}
                  <div style={{ padding: '15px 8px', textAlign: 'center', fontWeight: 600, borderBottom: `1px solid ${styles.borderColor}`, borderRight: `1px solid ${styles.borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: styles.textMain, fontSize: '0.85rem', backgroundColor: styles.background }}>
                    {hour}
                  </div>
                  {/* Slot cells for each day */}
                  {weekDays.map((day) => {
                    const activeDay = isToday(day);
                    const slotApps = getAppointmentsForSlot(day, hour);
                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() => handleCellClick(day, hour)}
                        style={{
                          padding: '6px',
                          borderBottom: `1px solid ${styles.borderColor}`,
                          borderRight: `1px solid ${styles.borderColor}`,
                          backgroundColor: activeDay ? 'rgba(54, 162, 235, 0.01)' : 'transparent',
                          minHeight: '80px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                        className="calendar-slot-cell"
                      >
                        {slotApps.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                            {slotApps.map((app) => {
                              const badge = statusBadgeColors[app.status] || { bg: '#eee', text: '#333', border: '#ddd' };
                              return (
                                <div
                                  key={app.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCalendarApp(app);
                                  }}
                                  style={{
                                    backgroundColor: badge.bg,
                                    color: badge.text,
                                    border: `1px solid ${badge.border}`,
                                    borderRadius: '6px',
                                    padding: '4px 6px',
                                    fontSize: '0.72rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                    transition: 'transform 0.15s ease',
                                    overflow: 'hidden'
                                  }}
                                  title={`${app.service_type} - Pet: ${app.pet_name}`}
                                >
                                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {new Date(app.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {app.pet_name}
                                  </span>
                                  <span style={{ fontSize: '0.68rem', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {app.service_type}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }} className="cell-plus-indicator">
                            <span style={{ color: styles.primary, fontSize: '1.2rem', fontWeight: 600 }}>+</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${styles.borderColor}`, borderRadius: '12px', overflow: 'hidden', backgroundColor: styles.cardBg, marginTop: '20px' }}>
          {/* Header */}
          <div style={{ padding: '15px 20px', backgroundColor: styles.background, borderBottom: `2px solid ${styles.borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: styles.primary, fontSize: '1.05rem' }}>Cronograma de Atendimentos</span>
            {isToday(currentDate) && (
              <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', backgroundColor: 'rgba(75, 192, 192, 0.1)', color: 'hsl(142, 60%, 40%)', border: '1px solid rgba(75, 192, 192, 0.2)' }}>Hoje</span>
            )}
          </div>
          {/* Hour timeline */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {hours.map((hour) => {
              const slotApps = getAppointmentsForSlot(currentDate, hour);
              return (
                <div key={hour} style={{ display: 'flex', borderBottom: `1px solid ${styles.borderColor}`, minHeight: '90px' }}>
                  {/* Left Column (Hour label) */}
                  <div style={{ width: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: styles.background, fontWeight: 700, borderRight: `1px solid ${styles.borderColor}`, color: styles.textMain, fontSize: '0.9rem' }}>
                    {hour}
                  </div>
                  {/* Right Column (Slot details) */}
                  <div
                    onClick={() => handleCellClick(currentDate, hour)}
                    style={{
                      flexGrow: 1,
                      padding: '12px 15px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      cursor: 'pointer',
                      backgroundColor: isToday(currentDate) ? 'rgba(54, 162, 235, 0.005)' : 'transparent',
                      transition: 'background-color 0.2s',
                      alignItems: 'center'
                    }}
                  >
                    {slotApps.length > 0 ? (
                      slotApps.map((app) => {
                        const badge = statusBadgeColors[app.status] || { bg: '#eee', text: '#333', border: '#ddd' };
                        return (
                          <div
                            key={app.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCalendarApp(app);
                            }}
                            style={{
                              backgroundColor: badge.bg,
                              color: badge.text,
                              border: `1px solid ${badge.border}`,
                              borderRadius: '8px',
                              padding: '10px 14px',
                              display: 'flex',
                              flexDirection: 'column',
                              minWidth: '220px',
                              maxWidth: '350px',
                              cursor: 'pointer',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                              position: 'relative'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{app.pet_name}</span>
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.4)' }}>{app.status}</span>
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 500, marginTop: '3px' }}>{app.service_type}</span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '2px' }}>{new Date(app.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            {app.notes && (
                              <p style={{ margin: '6px 0 0 0', fontSize: '0.72rem', fontStyle: 'italic', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                "{app.notes}"
                              </p>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <span style={{ color: styles.textMuted, fontSize: '0.82rem', pointerEvents: 'none' }}>+ Clique para agendar um serviço neste horário</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking Dialog Modal */}
      {isAdding && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '500px' }} role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
            <div style={styles.modalHeader}>
              <h2 id="booking-modal-title" style={styles.modalTitle}>{editingApp ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
              <button onClick={closeBooking} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            {activePetsList.length === 0 && !isStaffMode && !editingApp ? (
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
                {editingApp ? (
                  <div style={{ fontSize: '0.92rem', color: styles.textMain, padding: '10px 12px', borderRadius: '8px', backgroundColor: styles.background, border: `1px solid ${styles.borderColor}` }}>
                    Pet: <strong>{editingApp.pet_name}</strong>{editingApp.tutor_name ? <> · Tutor: <strong>{editingApp.tutor_name}</strong></> : null}
                  </div>
                ) : (
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
                      {isStaffMode && <option value="__manual">✍ Pet sem cadastro (digitar o nome)</option>}
                      {activePetsList.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.species}){isStaffMode ? ` - Tutor: ${p.tutor_name} (${p.tutor_email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!editingApp && selectedPetId === '__manual' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '15px' }}>
                    <div style={styles.formGroup}>
                      <label htmlFor="book-manual-pet" style={styles.formLabel}>Nome do pet *</label>
                      <input id="book-manual-pet" type="text" value={manualPet} onChange={(e) => setManualPet(e.target.value)} style={styles.formInput} placeholder="Ex: Neusa" required />
                    </div>
                    <div style={styles.formGroup}>
                      <label htmlFor="book-manual-tutor" style={styles.formLabel}>Tutor</label>
                      <input id="book-manual-tutor" type="text" value={manualTutor} onChange={(e) => setManualTutor(e.target.value)} style={styles.formInput} placeholder="Ex: Luciene" />
                    </div>
                  </div>
                )}

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

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '15px' }}>
                  <div style={styles.formGroup}>
                    <label htmlFor="book-date" style={styles.formLabel}>Data *</label>
                    <input
                      id="book-date"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      style={styles.formInput}
                      min={editingApp ? undefined : getTodayDateString()}
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

                {!editingApp && (
                  <div style={styles.formGroup}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: styles.textMain, cursor: 'pointer' }}>
                      <input type="checkbox" checked={repeatWeekly} onChange={(e) => setRepeatWeekly(e.target.checked)} />
                      Repetir toda semana, no mesmo dia e horário
                    </label>
                    {repeatWeekly && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: styles.textMain }}>
                        Total de
                        <input
                          type="number"
                          min={2}
                          max={104}
                          value={repeatCount}
                          onChange={(e) => setRepeatCount(e.target.value)}
                          style={{ ...styles.formInput, width: '90px', padding: '6px 10px' }}
                          aria-label="Quantas vezes repetir"
                        />
                        atendimentos (contando o primeiro)
                      </div>
                    )}
                  </div>
                )}

                {editingApp?.recurringEventId && (
                  <div style={styles.formGroup}>
                    <span style={styles.formLabel}>Este agendamento se repete. Aplicar a:</span>
                    {([['this', 'Só este dia'], ['series', 'Todos os dias da série (mantém o mesmo deslocamento de data e horário)']] as const).map(([v, label]) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: styles.textMain, cursor: 'pointer' }}>
                        <input type="radio" name="edit-scope" checked={editScope === v} onChange={() => setEditScope(v)} /> {label}
                      </label>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button
                    type="submit"
                    className="btn-save"
                    style={{ ...styles.formSubmitBtn(false), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexGrow: 1, margin: 0 }}
                  >
                    <Save size={16} /> {editingApp ? 'Salvar alterações' : 'Confirmar Agendamento'}
                  </button>
                  <button
                    type="button"
                    onClick={closeBooking}
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

      {/* Calendar Appointment Detail Modal */}
      {selectedCalendarApp && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '500px' }} role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
            <div style={styles.modalHeader}>
              <h2 id="detail-modal-title" style={styles.modalTitle}>Detalhes do Agendamento</h2>
              <button onClick={() => setSelectedCalendarApp(null)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ color: styles.primary }}>
                  {serviceIcons[selectedCalendarApp.service_type] || <PlusCircle size={18} />}
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: styles.textMain }}>
                  {selectedCalendarApp.service_type}
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: styles.background, padding: '15px', borderRadius: '8px', border: `1px solid ${styles.borderColor}` }}>
                <div style={{ fontSize: '0.92rem', color: styles.textMain }}>
                  Pet: <strong>{selectedCalendarApp.pet_name}</strong>
                  {selectedCalendarApp.tutor_name ? <> · Tutor: <strong>{selectedCalendarApp.tutor_name}</strong></> : null}
                </div>
                {selectedCalendarApp.recurringEventId && (
                  <div style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>🔁 Este agendamento se repete</div>
                )}
                <div style={{ fontSize: '0.92rem', color: styles.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} style={{ color: styles.primary }} />
                  <strong>{formatDate(selectedCalendarApp.scheduled_at)}</strong>
                </div>
                <div style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color }}>
                  Status: <strong style={{ color: (statusBadgeColors[selectedCalendarApp.status] || { text: styles.textMain }).text }}>{selectedCalendarApp.status}</strong>
                </div>
                {selectedCalendarApp.notes && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${styles.borderColor}`, fontSize: '0.88rem', color: styles.textMuted, fontStyle: 'italic' }}>
                    "{selectedCalendarApp.notes}"
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px', borderTop: `1px solid ${styles.borderColor}`, paddingTop: '15px', flexWrap: 'wrap' }}>
                {isStaffMode ? (
                  <>
                    <button
                      onClick={() => openEdit(selectedCalendarApp)}
                      style={{ ...styles.btnAcc(false), display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Clock size={14} /> Editar / Reagendar
                    </button>
                    {selectedCalendarApp.status === 'Agendado' && (
                      <button
                        onClick={async () => {
                          await handleUpdateStatus(selectedCalendarApp.id, 'Em Andamento');
                          setSelectedCalendarApp(null);
                        }}
                        style={{ ...styles.btnAcc(false), backgroundColor: styles.secondary, color: '#000', borderColor: styles.secondary }}
                      >
                        <Play size={14} /> Iniciar
                      </button>
                    )}
                    {selectedCalendarApp.status === 'Em Andamento' && (
                      <button
                        onClick={async () => {
                          await handleUpdateStatus(selectedCalendarApp.id, 'Concluído');
                          setSelectedCalendarApp(null);
                        }}
                        style={{ ...styles.btnAcc(false), backgroundColor: 'hsl(142, 60%, 40%)', color: '#fff', borderColor: 'hsl(142, 60%, 40%)' }}
                      >
                        <Check size={14} /> Concluir
                      </button>
                    )}
                    {(selectedCalendarApp.status === 'Agendado' || selectedCalendarApp.status === 'Em Andamento') && (
                      <button
                        onClick={async () => {
                          await handleUpdateStatus(selectedCalendarApp.id, 'Cancelado');
                          setSelectedCalendarApp(null);
                        }}
                        style={{ ...styles.btnAcc(false), border: '1px solid hsl(0, 75%, 55%)', color: 'hsl(0, 75%, 55%)' }}
                      >
                        <X size={14} /> Cancelar
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        await handleDelete(selectedCalendarApp.id);
                        setSelectedCalendarApp(null);
                      }}
                      style={{ ...styles.btnAcc(false), border: '1px solid hsl(0, 75%, 55%)', color: 'hsl(0, 75%, 55%)', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Trash2 size={14} /> Excluir
                    </button>
                  </>
                ) : (
                  selectedCalendarApp.status === 'Agendado' && (
                    <button
                      onClick={async () => {
                        await handleCancel(selectedCalendarApp.id);
                        setSelectedCalendarApp(null);
                      }}
                      style={{ ...styles.btnAcc(false), border: '1px solid hsl(0, 75%, 55%)', color: 'hsl(0, 75%, 55%)' }}
                    >
                      <X size={14} /> Cancelar Agendamento
                    </button>
                  )
                )}
                <button
                  onClick={() => setSelectedCalendarApp(null)}
                  style={styles.btnAcc(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pergunta: excluir só este dia ou a série inteira */}
      {scopeAsk && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '440px' }} role="dialog" aria-modal="true" aria-labelledby="scope-modal-title">
            <div style={styles.modalHeader}>
              <h2 id="scope-modal-title" style={{ ...styles.modalTitle, fontSize: '1.1rem' }}>Este agendamento se repete</h2>
              <button onClick={() => setScopeAsk(null)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>
            <p style={{ fontSize: '0.9rem', color: styles.textMain, margin: 0 }}>O que você quer excluir?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={async () => { const id = scopeAsk.id; setScopeAsk(null); setSelectedCalendarApp(null); await runDelete(id, 'this'); }}
                style={{ ...styles.btnAcc(false), padding: '12px', justifyContent: 'center' }}
              >
                Só este dia
              </button>
              <button
                type="button"
                onClick={async () => { const id = scopeAsk.id; setScopeAsk(null); setSelectedCalendarApp(null); await runDelete(id, 'series'); }}
                style={{ ...styles.btnAcc(false), padding: '12px', justifyContent: 'center', border: '1px solid hsl(0, 75%, 55%)', color: 'hsl(0, 75%, 55%)' }}
              >
                Todos os dias da série (inclusive os passados)
              </button>
              <button type="button" onClick={() => setScopeAsk(null)} style={{ ...styles.btnAcc(false), padding: '10px', justifyContent: 'center' }}>
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

