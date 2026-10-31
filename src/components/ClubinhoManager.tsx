import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlusCircle, RefreshCw, Edit3, Ban, X, Save, AlertTriangle, Search, ArrowUpDown, Receipt, Trash2 } from 'lucide-react';
import {
  listClubinhoWithAutoActions, createClubinho, updateClubinho, renewClubinho, cancelClubinho, registerClubinhoPayment,
  listClubinhoPayments, updateClubinhoPayment, deleteClubinhoPayment,
  getClubinhoStatus, describeClubinhoStatus, visitProgressLabel, CLUBINHO_STATUS_COLOR, CLUBINHO_STATUS_LABEL, CLUBINHO_STATUS_TOOLTIP, CLUBINHO_STATUS_DOT, CLUBINHO_STATUS_ICON, WEEKDAY_LABELS, PAYMENT_METHOD_LABELS,
} from '../utils/clubinhoService';
import type { ClubinhoSubscription, ClubinhoStatus, ClubinhoAutoAction, ClubinhoPayment } from '../utils/clubinhoService';
import { listPets } from '../utils/petsService';
import type { Pet } from '../utils/petsService';
import { logAction } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';

interface Props {
  styles: any;
  currentUser: AuthUser;
}

const fmtDate = (d: string) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const nowHHMM = (): string => new Date().toTimeString().slice(0, 5);

type PaymentFormState = { paidDate: string; paidTime: string; paymentMethod: 'pix' | 'debito' | 'credito' | 'especie'; receivedBy: string; cycleRenewalDate: string };
const emptyPaymentForm = (defaultReceivedBy: string, cycleRenewalDate: string): PaymentFormState => ({
  paidDate: todayStr(), paidTime: nowHHMM(), paymentMethod: 'pix', receivedBy: defaultReceivedBy, cycleRenewalDate,
});

type FormState = {
  petId: string; petName: string; tutorName: string; planType: 'semanal' | 'quinzenal' | 'avulso';
  weekday: number; timeOfDay: string; price: string; taxiDogFee: string; startedAt: string; renewsAt: string;
};

const emptyForm = (): FormState => ({
  petId: '', petName: '', tutorName: '', planType: 'semanal', weekday: 3, timeOfDay: '10:00',
  price: '', taxiDogFee: '', startedAt: todayStr(), renewsAt: addDays(todayStr(), 28),
});

export const ClubinhoManager: React.FC<Props> = ({ styles, currentUser }) => {
  const [subs, setSubs] = useState<ClubinhoSubscription[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [petSearch, setPetSearch] = useState('');
  const [petOptions, setPetOptions] = useState<Pet[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewDate, setRenewDate] = useState('');
  const [renewCreateAppts, setRenewCreateAppts] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<ClubinhoSubscription | null>(null);

  // Login compartilhado "Laviola" (usado tanto pelo André quanto pela Paloma, os dois proprietários): o sistema
  // não sabe qual dos dois está de fato usando o login agora, então pede pra escolher ao registrar um pagamento.
  const isSharedOwnerLogin = (currentUser.profile?.username || '').trim().toUpperCase() === 'LAVIOLA';
  const [paymentTarget, setPaymentTarget] = useState<ClubinhoSubscription | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(emptyPaymentForm(currentUser.name || '', todayStr()));
  const [paymentCycleOptions, setPaymentCycleOptions] = useState<string[]>([]);

  // Histórico de pagamentos por ciclo (criar/editar/apagar) — pra equipe nunca mais ter que adivinhar a quê
  // ciclo um pagamento antigo pertence (caso real da Nina, 2026-10-31).
  const [historyTarget, setHistoryTarget] = useState<ClubinhoSubscription | null>(null);
  const [historyList, setHistoryList] = useState<ClubinhoPayment[] | null>(null);
  const [historyCycleOptions, setHistoryCycleOptions] = useState<string[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyFormId, setHistoryFormId] = useState<string | null>(null); // null = fechado, 'new' = criando, senão id do pagamento em edição
  const [historyForm, setHistoryForm] = useState<PaymentFormState>(emptyPaymentForm('', todayStr()));
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState<ClubinhoPayment | null>(null);

  // Visão ampla: a tabela (com bastante coluna) fica espremida na área de conteúdo normal; isso a estica até a
  // largura toda da página, do menu até o aviso lateral — mesma ideia já usada na Agenda.
  const [wideView, setWideView] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [widePos, setWidePos] = useState<{ top: number; left: number; width: number } | null>(null);
  const measureWide = () => {
    const bar = toolbarRef.current;
    const grid = document.getElementById('main-content')?.parentElement;
    if (!bar || !grid) return;
    const b = bar.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    setWidePos({ top: b.bottom + window.scrollY + 10, left: g.left + window.scrollX, width: g.width });
  };
  useLayoutEffect(() => {
    if (!wideView) return;
    measureWide();
    window.addEventListener('resize', measureWide);
    return () => window.removeEventListener('resize', measureWide);
  }, [wideView]);

  // Busca, filtros e ordenação
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ClubinhoStatus>('all');
  const [filterPlan, setFilterPlan] = useState<'all' | 'semanal' | 'quinzenal' | 'avulso'>('all');
  const [sortBy, setSortBy] = useState<'renewal' | 'name' | 'price' | 'status'>('renewal');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Registra no histórico de auditoria o que o motor automático fez sozinho (montou ou desmontou um ciclo),
  // pra equipe sempre conseguir ver o porquê de um agendamento ter sumido ou aparecido sem ninguém ter clicado
  // em nada.
  const logAutoAction = async (a: ClubinhoAutoAction) => {
    const pet = a.pet_name || a.assinatura.pet_name;
    if (a.tipo === 'montado') {
      await logAction(
        'sistema', 'Sistema (motor automático)', 'Montagem automática do Clubinho',
        `Próximo ciclo de "${pet}" montado automaticamente (${a.agendamentos_criados || 0} agendamento(s)) — cor não muda até esse ciclo também terminar.`
      );
    } else if (a.tipo === 'aguardando_confirmacao') {
      await logAction(
        'sistema', 'Sistema (motor automático)', 'Reconfirmação pedida pelo Clubinho',
        `Ciclo de "${pet}" chegou ao fim — status voltou para "A confirmar", aguardando a equipe confirmar o pagamento.`
      );
    } else {
      const datas = (a.agendamentos_removidos || []).map(r => fmtDate(r.starts_at.slice(0, 10))).join(', ');
      await logAction(
        'sistema', 'Sistema (motor automático)', 'Exclusão automática do Clubinho',
        `Ciclo futuro de "${pet}" desmontado automaticamente — marcação virou Inadimplente/Congelada. ${a.agendamentos_removidos?.length || 0} agendamento(s) removido(s)${datas ? ` (${datas})` : ''}.`
      );
    }
  };

  const load = async () => {
    setErrorMsg(null);
    try {
      const { assinaturas, autoAcoes } = await listClubinhoWithAutoActions();
      setSubs(assinaturas);
      for (const a of autoAcoes) await logAutoAction(a);
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao carregar as assinaturas do Clubinho.');
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (petSearch.trim().length < 2) { setPetOptions([]); return; }
    let cancelled = false;
    listPets().then(all => {
      if (cancelled) return;
      const q = petSearch.trim().toLowerCase();
      setPetOptions(all.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [petSearch]);

  const activeSubs = useMemo(() => (subs || []).filter(s => s.is_active), [subs]);
  const vencidos = useMemo(() => activeSubs.filter(s => getClubinhoStatus(s) === 'vencido'), [activeSubs]);
  const aConfirmar = useMemo(() => activeSubs.filter(s => getClubinhoStatus(s) === 'a-confirmar'), [activeSubs]);

  const STATUS_RANK: Record<ClubinhoStatus, number> = { inadimplente: 0, vencido: 1, 'a-confirmar': 2, 'sem-marcacao': 3, congelada: 4, pago: 5, inativo: 6 };
  const visibleSubs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = activeSubs.filter(s => {
      if (filterPlan !== 'all' && s.plan_type !== filterPlan) return false;
      if (filterStatus !== 'all' && getClubinhoStatus(s) !== filterStatus) return false;
      if (q && !s.pet_name.toLowerCase().includes(q) && !(s.tutor_name || '').toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'renewal') cmp = a.renews_at.localeCompare(b.renews_at);
      else if (sortBy === 'name') cmp = a.pet_name.localeCompare(b.pet_name);
      else if (sortBy === 'price') cmp = Number(a.price) - Number(b.price);
      else if (sortBy === 'status') cmp = STATUS_RANK[getClubinhoStatus(a)] - STATUS_RANK[getClubinhoStatus(b)];
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [activeSubs, searchQuery, filterStatus, filterPlan, sortBy, sortDir]);

  const resetForm = () => { setForm(emptyForm()); setPetSearch(''); setPetOptions([]); setIsCreating(false); setEditingId(null); };

  const pickPet = (p: Pet) => {
    setForm(f => ({ ...f, petId: p.id, petName: p.name, tutorName: f.tutorName || p.tutor_hint || '' }));
    setPetSearch(p.name);
    setPetOptions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!form.petId) { setErrorMsg('Escolha um pet já cadastrado na lista.'); return; }
    if (!form.price.trim()) { setErrorMsg('Informe o valor.'); return; }
    try {
      const input = {
        petId: form.petId, petName: form.petName, tutorName: form.tutorName.trim(), planType: form.planType,
        weekday: form.weekday, timeOfDay: form.timeOfDay, price: Number(form.price) || 0,
        taxiDogFee: Number(form.taxiDogFee) || 0, startedAt: form.startedAt,
        // Avulso não tem renovação de verdade: trava sempre igual à data, mesmo que o campo (desabilitado) tenha
        // ficado com outro valor por algum motivo.
        renewsAt: form.planType === 'avulso' ? form.startedAt : form.renewsAt,
      };
      if (editingId) {
        await updateClubinho(editingId, input);
        await logAction(currentUser.email || '', currentUser.name || 'Equipe', 'Edição de Assinatura do Clubinho', `Assinatura de "${form.petName}" atualizada.`);
      } else {
        await createClubinho(input);
        await logAction(currentUser.email || '', currentUser.name || 'Equipe', 'Nova Assinatura do Clubinho', `Assinatura criada para "${form.petName}" (${form.planType}, R$ ${form.price}).`);
      }
      resetForm();
      load();
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao salvar a assinatura.');
    }
  };

  const startEdit = (s: ClubinhoSubscription) => {
    setEditingId(s.id);
    setIsCreating(true);
    setForm({
      petId: s.pet_id, petName: s.pet_name, tutorName: s.tutor_name, planType: s.plan_type,
      weekday: s.weekday ?? 3, timeOfDay: s.time_of_day, price: String(s.price), taxiDogFee: String(s.taxi_dog_fee),
      startedAt: s.started_at, renewsAt: s.renews_at,
    });
    setPetSearch(s.pet_name);
  };

  const openRenew = (s: ClubinhoSubscription) => {
    setRenewingId(s.id);
    setRenewDate(addDays(s.renews_at, s.plan_type === 'quinzenal' ? 28 : 28));
    setRenewCreateAppts(true);
  };

  const confirmRenew = async () => {
    if (!renewingId || !renewDate) return;
    setBusyId(renewingId);
    try {
      const sub = subs?.find(s => s.id === renewingId);
      const r = await renewClubinho(renewingId, renewDate, renewCreateAppts);
      await logAction(
        currentUser.email || '', currentUser.name || 'Equipe', 'Renovação do Clubinho',
        `Assinatura de "${sub?.pet_name}" renovada até ${fmtDate(renewDate)}${r.agendamentos_criados ? ` (${r.agendamentos_criados} agendamentos criados)` : ''}.`
      );
      setRenewingId(null);
      load();
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao renovar.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    try {
      await cancelClubinho(cancelTarget.id);
      await logAction(currentUser.email || '', currentUser.name || 'Equipe', 'Cancelamento do Clubinho', `Assinatura de "${cancelTarget.pet_name}" cancelada.`);
      setCancelTarget(null);
      load();
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao cancelar.');
    } finally {
      setBusyId(null);
    }
  };

  const setPaymentFlag = async (s: ClubinhoSubscription, flag: 'a_confirmar' | 'debito' | 'inadimplente' | 'congelada' | null) => {
    setBusyId(s.id);
    try {
      const { autoAcao } = await updateClubinho(s.id, { paymentFlag: flag });
      const label = flag === 'debito' ? 'Vencido/Débito' : flag === 'a_confirmar' ? 'A confirmar' : flag === 'inadimplente' ? 'Inadimplente (Suspenso)' : flag === 'congelada' ? 'Congelada' : 'Sem marcação';
      await logAction(currentUser.email || '', currentUser.name || 'Equipe', 'Marcação de pagamento do Clubinho', `Status de "${s.pet_name}" marcado como: ${label}.`);
      if (autoAcao) await logAutoAction(autoAcao);
      load();
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao marcar o status.');
    } finally {
      setBusyId(null);
    }
  };

  const openPaymentForm = async (s: ClubinhoSubscription) => {
    setPaymentTarget(s);
    setPaymentForm(emptyPaymentForm(isSharedOwnerLogin ? '' : (currentUser.name || ''), s.last_renewed_at || todayStr()));
    setPaymentCycleOptions(s.last_renewed_at ? [s.last_renewed_at] : []);
    try {
      const { cycles } = await listClubinhoPayments(s.id);
      setPaymentCycleOptions(cycles);
    } catch { /* mantém a opção mínima já definida acima */ }
  };

  const handleRegisterPayment = async () => {
    if (!paymentTarget) return;
    if (!paymentForm.receivedBy.trim()) { setErrorMsg('Informe quem recebeu o pagamento.'); return; }
    setBusyId(paymentTarget.id);
    setErrorMsg(null);
    try {
      const { autoAcao } = await registerClubinhoPayment(paymentTarget.id, {
        paidDate: paymentForm.paidDate, paidTime: paymentForm.paidTime,
        paymentMethod: paymentForm.paymentMethod, receivedBy: paymentForm.receivedBy.trim(),
        cycleRenewalDate: paymentForm.cycleRenewalDate,
      });
      await logAction(
        currentUser.email || '', currentUser.name || 'Equipe', 'Pagamento do Clubinho registrado',
        `Pagamento de "${paymentTarget.pet_name}" registrado: ${PAYMENT_METHOD_LABELS[paymentForm.paymentMethod]}, em ${fmtDate(paymentForm.paidDate)} às ${paymentForm.paidTime}, recebido por ${paymentForm.receivedBy.trim()} — referente à renovação de ${fmtDate(paymentForm.cycleRenewalDate)}.`
      );
      if (autoAcao) await logAutoAction(autoAcao);
      setPaymentTarget(null);
      load();
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao registrar o pagamento.');
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (s: ClubinhoSubscription) => {
    setHistoryTarget(s);
    setHistoryList(null);
    setHistoryCycleOptions(s.last_renewed_at ? [s.last_renewed_at] : []);
    setHistoryError(null);
    setHistoryFormId(null);
    try {
      const { payments, cycles } = await listClubinhoPayments(s.id);
      setHistoryList(payments);
      setHistoryCycleOptions(cycles);
    } catch (e: any) {
      setHistoryError(e.message || 'Erro ao carregar os pagamentos.');
    }
  };

  const reloadHistory = async () => {
    if (!historyTarget) return;
    try {
      const { payments, cycles } = await listClubinhoPayments(historyTarget.id);
      setHistoryList(payments);
      setHistoryCycleOptions(cycles);
    } catch (e: any) {
      setHistoryError(e.message || 'Erro ao carregar os pagamentos.');
    }
  };

  const startNewHistoryPayment = () => {
    if (!historyTarget) return;
    setHistoryFormId('new');
    setHistoryForm(emptyPaymentForm(isSharedOwnerLogin ? '' : (currentUser.name || ''), historyTarget.last_renewed_at || todayStr()));
  };

  const startEditHistoryPayment = (p: ClubinhoPayment) => {
    setHistoryFormId(p.id);
    setHistoryForm({ paidDate: p.paid_date, paidTime: p.paid_time, paymentMethod: p.payment_method, receivedBy: p.received_by, cycleRenewalDate: p.cycle_renewal_date || '' });
  };

  const saveHistoryPayment = async () => {
    if (!historyTarget || !historyFormId) return;
    if (!historyForm.receivedBy.trim()) { setHistoryError('Informe quem recebeu o pagamento.'); return; }
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      if (historyFormId === 'new') {
        const { autoAcao } = await registerClubinhoPayment(historyTarget.id, {
          paidDate: historyForm.paidDate, paidTime: historyForm.paidTime,
          paymentMethod: historyForm.paymentMethod, receivedBy: historyForm.receivedBy.trim(),
          cycleRenewalDate: historyForm.cycleRenewalDate,
        });
        await logAction(
          currentUser.email || '', currentUser.name || 'Equipe', 'Pagamento do Clubinho registrado',
          `Pagamento de "${historyTarget.pet_name}" registrado: ${PAYMENT_METHOD_LABELS[historyForm.paymentMethod]}, em ${fmtDate(historyForm.paidDate)} às ${historyForm.paidTime}, recebido por ${historyForm.receivedBy.trim()} — referente à renovação de ${fmtDate(historyForm.cycleRenewalDate)}.`
        );
        if (autoAcao) await logAutoAction(autoAcao);
      } else {
        await updateClubinhoPayment(historyFormId, {
          paidDate: historyForm.paidDate, paidTime: historyForm.paidTime,
          paymentMethod: historyForm.paymentMethod, receivedBy: historyForm.receivedBy.trim(),
          cycleRenewalDate: historyForm.cycleRenewalDate,
        });
        await logAction(
          currentUser.email || '', currentUser.name || 'Equipe', 'Pagamento do Clubinho editado',
          `Pagamento de "${historyTarget.pet_name}" (referente à renovação de ${fmtDate(historyForm.cycleRenewalDate)}) corrigido.`
        );
      }
      setHistoryFormId(null);
      await reloadHistory();
      load();
    } catch (e: any) {
      setHistoryError(e.message || 'Erro ao salvar o pagamento.');
    } finally {
      setHistoryBusy(false);
    }
  };

  const confirmDeleteHistoryPayment = async () => {
    if (!historyDeleteTarget || !historyTarget) return;
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      await deleteClubinhoPayment(historyDeleteTarget.id);
      await logAction(
        currentUser.email || '', currentUser.name || 'Equipe', 'Pagamento do Clubinho apagado',
        `Pagamento de "${historyTarget.pet_name}" (${fmtDate(historyDeleteTarget.paid_date)}, referente à renovação de ${historyDeleteTarget.cycle_renewal_date ? fmtDate(historyDeleteTarget.cycle_renewal_date) : '—'}) removido do histórico.`
      );
      setHistoryDeleteTarget(null);
      await reloadHistory();
      load();
    } catch (e: any) {
      setHistoryError(e.message || 'Erro ao apagar o pagamento.');
    } finally {
      setHistoryBusy(false);
    }
  };

  // Campos compartilhados entre o popup rápido de confirmação e a linha de criar/editar do histórico.
  const renderPaymentFields = (form: PaymentFormState, setForm: React.Dispatch<React.SetStateAction<PaymentFormState>>, lastRenewedAt: string, cycleOptions: string[]) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '6px' }}>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Data</label>
          <input type="date" value={form.paidDate} onChange={(e) => setForm(f => ({ ...f, paidDate: e.target.value }))} style={styles.formInput} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Hora</label>
          <input type="time" value={form.paidTime} onChange={(e) => setForm(f => ({ ...f, paidTime: e.target.value }))} style={styles.formInput} />
        </div>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Referente à renovação de</label>
        <select value={form.cycleRenewalDate} onChange={(e) => setForm(f => ({ ...f, cycleRenewalDate: e.target.value }))} style={styles.formInput}>
          {!cycleOptions.includes(form.cycleRenewalDate) && form.cycleRenewalDate && (
            <option value={form.cycleRenewalDate}>{fmtDate(form.cycleRenewalDate)}</option>
          )}
          {cycleOptions.map(c => (
            <option key={c} value={c}>{fmtDate(c)}{c === lastRenewedAt ? ' (ciclo atual)' : ''}</option>
          ))}
        </select>
        <span style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color }}>
          Só mostra datas que já marcaram o início de um ciclo real dessa assinatura.
        </span>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Forma de pagamento</label>
        <select value={form.paymentMethod} onChange={(e) => setForm(f => ({ ...f, paymentMethod: e.target.value as PaymentFormState['paymentMethod'] }))} style={styles.formInput}>
          <option value="pix">Pix</option>
          <option value="debito">Débito</option>
          <option value="credito">Crédito</option>
          <option value="especie">Espécie</option>
        </select>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Quem recebeu</label>
        {isSharedOwnerLogin ? (
          <select value={form.receivedBy} onChange={(e) => setForm(f => ({ ...f, receivedBy: e.target.value }))} style={styles.formInput}>
            <option value="">Selecione...</option>
            <option value="André">André</option>
            <option value="Paloma">Paloma</option>
          </select>
        ) : (
          <input type="text" value={form.receivedBy} onChange={(e) => setForm(f => ({ ...f, receivedBy: e.target.value }))} style={styles.formInput} placeholder="Nome de quem recebeu" />
        )}
      </div>
    </>
  );

  const statusPill = (s: ClubinhoSubscription) => {
    const st = getClubinhoStatus(s);
    const color = CLUBINHO_STATUS_COLOR[st];
    const icon = CLUBINHO_STATUS_ICON[st];
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', backgroundColor: `${color}22`, color, border: `1px solid ${color}55`, whiteSpace: 'nowrap' }}>
        {icon ? <span style={{ fontSize: '9px' }}>{icon}</span> : <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />} {describeClubinhoStatus(s)}
      </span>
    );
  };

  return (
    <section>
      {(vencidos.length > 0 || aConfirmar.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          {vencidos.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', backgroundColor: 'hsl(280,65%,50%,0.1)', border: '1px solid hsl(280,65%,50%,0.3)', color: 'hsl(280,65%,35%)', fontSize: '0.85rem', fontWeight: 600 }}>
              <AlertTriangle size={15} /> {vencidos.length} assinatura(s) vencida(s)
            </div>
          )}
          {aConfirmar.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', backgroundColor: 'hsl(210,85%,50%,0.1)', border: '1px solid hsl(210,85%,50%,0.3)', color: 'hsl(210,85%,35%)', fontSize: '0.85rem', fontWeight: 600 }}>
              <AlertTriangle size={15} /> {aConfirmar.length} renovação/ões nos próximos dias
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        {!isCreating && (
          <button type="button" onClick={() => setIsCreating(true)} style={styles.btnAcc(false)}>
            <PlusCircle size={16} /> Nova assinatura
          </button>
        )}
      </div>

      {errorMsg && (
        <div style={{ color: 'hsl(0,75%,45%)', fontSize: '0.85rem', margin: '0 0 12px', padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)', borderRadius: '6px', border: '1px solid hsl(0,75%,55%,0.25)' }}>
          {errorMsg}
        </div>
      )}

      {isCreating && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '640px' }} role="dialog" aria-modal="true" aria-labelledby="clubinho-form-title">
            <div style={styles.modalHeader}>
              <h2 id="clubinho-form-title" style={{ ...styles.modalTitle, fontSize: '1.05rem' }}>
                {editingId ? 'Editar assinatura' : 'Nova assinatura do Clubinho'}
              </h2>
              <button onClick={resetForm} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={handleSubmit} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Pet (já cadastrado) *</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
                  <input
                    type="text" value={petSearch} disabled={!!editingId}
                    onChange={(e) => { setPetSearch(e.target.value); setForm(f => ({ ...f, petId: '', petName: '' })); }}
                    placeholder="Digite o nome do pet..." style={{ ...styles.formInput, width: '100%', paddingLeft: '32px' }}
                  />
                </div>
                {petOptions.length > 0 && (
                  <div style={{ border: `1px solid ${styles.borderColor}`, borderRadius: '8px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto' }}>
                    {petOptions.map(p => (
                      <button key={p.id} type="button" onClick={() => pickPet(p)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: styles.textMain }}>
                        {p.name} {p.tutor_hint ? `— tutor: ${p.tutor_hint}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                {form.petId && <p style={{ fontSize: '0.78rem', color: 'hsl(142,60%,35%)', margin: '4px 0 0' }}>Selecionado: {form.petName}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Nome do tutor</label>
                  <input type="text" value={form.tutorName} onChange={(e) => setForm(f => ({ ...f, tutorName: e.target.value }))} style={styles.formInput} placeholder="Ex: Julio" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Plano *</label>
                  <select
                    value={form.planType}
                    onChange={(e) => {
                      const planType = e.target.value as 'semanal' | 'quinzenal' | 'avulso';
                      setForm(f => ({
                        ...f, planType,
                        // Avulso não renova: trava a Renovação igual à data. Saindo do avulso, devolve um prazo normal.
                        renewsAt: planType === 'avulso' ? f.startedAt : (f.planType === 'avulso' ? addDays(f.startedAt, 28) : f.renewsAt),
                      }));
                    }}
                    style={styles.formInput}
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="avulso">Avulso (atendimento único)</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Dia da semana</label>
                  <select value={form.weekday} onChange={(e) => setForm(f => ({ ...f, weekday: Number(e.target.value) }))} style={styles.formInput}>
                    {WEEKDAY_LABELS.map((w, i) => <option key={i} value={i}>{w}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Horário</label>
                  <input type="time" value={form.timeOfDay} onChange={(e) => setForm(f => ({ ...f, timeOfDay: e.target.value }))} style={styles.formInput} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Valor (R$) *</label>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} style={styles.formInput} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Táxi dog (R$)</label>
                  <input type="number" min="0" step="0.01" value={form.taxiDogFee} onChange={(e) => setForm(f => ({ ...f, taxiDogFee: e.target.value }))} style={styles.formInput} placeholder="0" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>{form.planType === 'avulso' ? 'Data *' : 'Início *'}</label>
                  <input
                    type="date" value={form.startedAt}
                    onChange={(e) => setForm(f => ({ ...f, startedAt: e.target.value, renewsAt: f.planType === 'avulso' ? e.target.value : f.renewsAt }))}
                    style={styles.formInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Renovação {form.planType !== 'avulso' && '*'}</label>
                  <input
                    type="date" value={form.planType === 'avulso' ? form.startedAt : form.renewsAt} disabled={form.planType === 'avulso'}
                    onChange={(e) => setForm(f => ({ ...f, renewsAt: e.target.value }))}
                    title={form.planType === 'avulso' ? 'Atendimento avulso não tem renovação.' : undefined}
                    style={{ ...styles.formInput, ...(form.planType === 'avulso' ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button type="submit" className="btn-save" style={styles.btnAcc(false)}><Save size={16} /> Salvar</button>
                <button type="button" onClick={resetForm} style={styles.btnAcc(false)}><X size={16} /> Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {subs !== null && activeSubs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '12px', fontSize: '0.76rem', color: styles.sidebarWidgetText?.color }}>
          <span style={{ fontWeight: 600 }}>Status:</span>
          {(['a-confirmar', 'vencido', 'pago', 'inadimplente', 'congelada', 'sem-marcacao'] as const).map(st => (
            <span key={st} title={CLUBINHO_STATUS_TOOLTIP[st]} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>
              {CLUBINHO_STATUS_ICON[st] ? (
                <span style={{ fontSize: '9px' }}>{CLUBINHO_STATUS_ICON[st]}</span>
              ) : (
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: CLUBINHO_STATUS_COLOR[st] }} />
              )}
              {CLUBINHO_STATUS_LABEL[st]}
            </span>
          ))}
        </div>
      )}

      {subs !== null && activeSubs.length > 0 && (
        <div ref={toolbarRef} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '14px', paddingBottom: '12px', borderBottom: `1px solid ${styles.borderColor}` }}>
          <div style={{ position: 'relative', flex: '0 1 220px', minWidth: '160px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por pet ou tutor..." style={{ ...styles.formInput, width: '100%', padding: '7px 10px 7px 32px', fontSize: '0.85rem' }}
            />
          </div>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} style={{ ...styles.formInput, width: 'auto', padding: '7px 10px', fontSize: '0.85rem' }}>
            <option value="all">Todos os status</option>
            <option value="vencido">Vencidas</option>
            <option value="a-confirmar">A confirmar</option>
            <option value="pago">Pagamento realizado</option>
            <option value="inadimplente">Inadimplente (Suspenso)</option>
            <option value="congelada">Congelada</option>
            <option value="sem-marcacao">Sem marcação</option>
          </select>

          <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value as any)} style={{ ...styles.formInput, width: 'auto', padding: '7px 10px', fontSize: '0.85rem' }}>
            <option value="all">Todos os planos</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="avulso">Avulso</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: styles.textMain }}>Ordenar por:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ ...styles.formInput, width: 'auto', padding: '7px 10px', fontSize: '0.85rem' }}>
              <option value="renewal">Renovação</option>
              <option value="name">Pet (A-Z)</option>
              <option value="price">Valor</option>
              <option value="status">Status</option>
            </select>
            <button
              type="button" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              title={sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
              className="btn-action-icon"
            >
              <ArrowUpDown size={14} style={{ transform: sortDir === 'desc' ? 'scaleY(-1)' : undefined }} />
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, color: styles.textMain, cursor: 'pointer', marginLeft: 'auto' }}>
            <input type="checkbox" checked={wideView} onChange={(e) => setWideView(e.target.checked)} style={{ cursor: 'pointer' }} />
            Visão ampla
          </label>
        </div>
      )}

      {subs === null ? (
        <p style={{ color: styles.sidebarWidgetText?.color }}>Carregando...</p>
      ) : activeSubs.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, textAlign: 'center', padding: '30px' }}>Nenhuma assinatura do Clubinho cadastrada ainda.</p>
      ) : visibleSubs.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, textAlign: 'center', padding: '30px' }}>Nenhuma assinatura corresponde aos filtros.</p>
      ) : (() => {
        const table = (
          <div
            className="table-row-hoverable"
            style={{ overflowX: 'auto', border: `1px solid ${styles.borderColor}`, borderRadius: '10px', '--row-hover-bg': styles.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(19,114,218,0.07)' } as React.CSSProperties}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: styles.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                  {['#', 'Pet', 'Tutor', 'Plano', 'Início', 'Última Renovação', 'Próxima Renovação', 'Dia/Horário', 'Valor', 'Táxi dog', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSubs.map((s, idx) => (
                  <tr key={s.id} style={{ borderTop: `1px solid ${styles.borderColor}` }}>
                    <td style={{ padding: '8px 10px', color: styles.sidebarWidgetText?.color }}>{idx + 1}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: styles.textMain, whiteSpace: 'nowrap' }}>
                      {s.pet_name} <span style={{ fontWeight: 500, fontSize: '0.78rem', color: styles.sidebarWidgetText?.color }}>{visitProgressLabel(s, new Date(), s.real_cycle_position)}</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: styles.sidebarWidgetText?.color }}>{s.tutor_name || '—'}</td>
                    <td style={{ padding: '8px 10px', color: styles.textMain, textTransform: 'capitalize' }}>{s.plan_type}</td>
                    <td style={{ padding: '8px 10px', color: styles.sidebarWidgetText?.color, whiteSpace: 'nowrap' }}>{fmtDate(s.started_at)}</td>
                    <td style={{ padding: '8px 10px', color: styles.sidebarWidgetText?.color, whiteSpace: 'nowrap' }}>{s.last_renewed_at ? fmtDate(s.last_renewed_at) : '—'}</td>
                    <td style={{ padding: '8px 10px', color: styles.textMain, whiteSpace: 'nowrap' }}>{fmtDate(s.renews_at)}</td>
                    <td style={{ padding: '8px 10px', color: styles.textMain, whiteSpace: 'nowrap' }}>{s.weekday !== null ? `${WEEKDAY_LABELS[s.weekday]} ${s.time_of_day}` : '—'}</td>
                    <td style={{ padding: '8px 10px', color: styles.textMain, whiteSpace: 'nowrap' }}>R$ {Number(s.price).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', color: styles.sidebarWidgetText?.color, whiteSpace: 'nowrap' }}>{Number(s.taxi_dog_fee) > 0 ? `R$ ${Number(s.taxi_dog_fee).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {statusPill(s)}
                        <select
                          value={s.payment_flag || ''}
                          disabled={busyId === s.id}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'pago') openPaymentForm(s);
                            else setPaymentFlag(s, v as 'a_confirmar' | 'debito' | 'inadimplente' | 'congelada');
                          }}
                          title="Marcação da equipe (não há mais cálculo automático)"
                          style={{ fontSize: '0.7rem', padding: '2px 4px', borderRadius: '5px', border: `1px solid ${styles.borderColor}`, backgroundColor: 'transparent', color: styles.sidebarWidgetText?.color, cursor: 'pointer' }}
                        >
                          {!s.payment_flag && <option value="" disabled>Selecione um status...</option>}
                          <option value="a_confirmar">{CLUBINHO_STATUS_DOT['a-confirmar']} Marcar: A confirmar</option>
                          <option value="debito">{CLUBINHO_STATUS_DOT.vencido} Marcar: Vencido/Débito</option>
                          <option value="pago">{CLUBINHO_STATUS_DOT.pago} Marcar: Pagamento realizado</option>
                          <option value="inadimplente">{CLUBINHO_STATUS_DOT.inadimplente} Marcar: Inadimplente (Suspenso)</option>
                          <option value="congelada">{CLUBINHO_STATUS_DOT.congelada} Marcar: Congelada</option>
                        </select>
                      </div>
                      {s.payment_flag === 'pago' && s.last_payment && (
                        <div style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color, marginTop: '3px' }}>
                          {PAYMENT_METHOD_LABELS[s.last_payment.payment_method]} em {fmtDate(s.last_payment.paid_date)} às {s.last_payment.paid_time}, recebido por {s.last_payment.received_by}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          type="button" disabled={busyId === s.id || s.plan_type === 'avulso'} onClick={() => openRenew(s)}
                          title={s.plan_type === 'avulso' ? 'Atendimento avulso não tem renovação' : 'Renovar'}
                          className="btn-action-icon"
                        ><RefreshCw size={14} /></button>
                        <button type="button" disabled={busyId === s.id} onClick={() => startEdit(s)} title="Editar" className="btn-action-icon"><Edit3 size={14} /></button>
                        <button type="button" disabled={busyId === s.id} onClick={() => openHistory(s)} title="Histórico de pagamentos" className="btn-action-icon"><Receipt size={14} /></button>
                        <button type="button" disabled={busyId === s.id} onClick={() => setCancelTarget(s)} title="Cancelar" className="btn-action-icon btn-action-danger"><Ban size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        if (!wideView || !widePos) return table;
        return createPortal(
          <div
            role="region"
            aria-label="Assinaturas do Clubinho em visão ampla"
            style={{
              position: 'absolute', top: widePos.top, left: widePos.left, width: widePos.width,
              zIndex: 90, boxSizing: 'border-box', padding: '16px',
              backgroundColor: styles.isDark ? '#161a26' : '#ffffff', border: `1px solid ${styles.borderColor}`,
              borderRadius: '14px', boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
            }}
          >
            {table}
          </div>,
          document.body
        );
      })()}

      {renewingId && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '380px' }} role="dialog" aria-modal="true">
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, fontSize: '1.05rem' }}>Renovar assinatura</h2>
              <button onClick={() => setRenewingId(null)} style={styles.modalCloseBtn(false)}>✕</button>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Nova data de renovação</label>
              <input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} style={styles.formInput} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: styles.textMain, cursor: 'pointer', marginTop: '8px' }}>
              <input type="checkbox" checked={renewCreateAppts} onChange={(e) => setRenewCreateAppts(e.target.checked)} />
              Já criar os agendamentos na agenda até essa data
            </label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="button" disabled={busyId === renewingId} onClick={confirmRenew} className="btn-save" style={styles.btnAcc(false)}>
                {busyId === renewingId ? 'Renovando...' : 'Confirmar renovação'}
              </button>
              <button type="button" onClick={() => setRenewingId(null)} style={styles.btnAcc(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {paymentTarget && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '400px' }} role="dialog" aria-modal="true">
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, fontSize: '1.05rem' }}>Registrar pagamento — {paymentTarget.pet_name}</h2>
              <button onClick={() => setPaymentTarget(null)} style={styles.modalCloseBtn(false)}>✕</button>
            </div>
            {renderPaymentFields(paymentForm, setPaymentForm, paymentTarget.last_renewed_at || paymentTarget.started_at, paymentCycleOptions)}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" disabled={busyId === paymentTarget.id} onClick={handleRegisterPayment} className="btn-save" style={styles.btnAcc(false)}>
                {busyId === paymentTarget.id ? 'Salvando...' : 'Confirmar pagamento'}
              </button>
              <button type="button" onClick={() => setPaymentTarget(null)} style={styles.btnAcc(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '380px' }} role="dialog" aria-modal="true">
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, fontSize: '1.05rem' }}>Cancelar assinatura?</h2>
              <button onClick={() => setCancelTarget(null)} style={styles.modalCloseBtn(false)}>✕</button>
            </div>
            <p style={{ fontSize: '0.88rem', color: styles.sidebarWidgetText?.color }}>
              A assinatura de <strong>{cancelTarget.pet_name}</strong> será marcada como inativa (o histórico fica guardado, não é apagado).
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" disabled={busyId === cancelTarget.id} onClick={confirmCancel} style={{ ...styles.btnAcc(false), backgroundColor: 'hsl(0,75%,55%)', color: '#fff' }}>
                {busyId === cancelTarget.id ? 'Cancelando...' : 'Sim, cancelar'}
              </button>
              <button type="button" onClick={() => setCancelTarget(null)} style={styles.btnAcc(false)}>Voltar</button>
            </div>
          </div>
        </div>
      )}

      {historyTarget && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '560px' }} role="dialog" aria-modal="true">
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, fontSize: '1.05rem' }}>Histórico de pagamentos — {historyTarget.pet_name}</h2>
              <button onClick={() => { setHistoryTarget(null); setHistoryList(null); setHistoryFormId(null); }} style={styles.modalCloseBtn(false)}>✕</button>
            </div>
            {historyError && <p style={{ color: 'hsl(0,75%,50%)', fontSize: '0.82rem' }}>{historyError}</p>}
            {historyList === null ? (
              <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.85rem' }}>Carregando...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto', marginTop: '8px' }}>
                {historyList.length === 0 && <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.85rem' }}>Nenhum pagamento registrado ainda.</p>}
                {historyList.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', border: `1px solid ${styles.borderColor}`, borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.8rem', color: styles.textMain }}>
                      <strong>Ciclo de {p.cycle_renewal_date ? fmtDate(p.cycle_renewal_date) : '—'}</strong>
                      <div style={{ color: styles.sidebarWidgetText?.color, marginTop: '2px' }}>
                        {PAYMENT_METHOD_LABELS[p.payment_method]} em {fmtDate(p.paid_date)} às {p.paid_time}, recebido por {p.received_by}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button type="button" onClick={() => startEditHistoryPayment(p)} title="Editar" className="btn-action-icon"><Edit3 size={13} /></button>
                      <button type="button" onClick={() => setHistoryDeleteTarget(p)} title="Apagar" className="btn-action-icon btn-action-danger"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {historyFormId ? (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${styles.borderColor}` }}>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: styles.textMain, margin: 0 }}>
                  {historyFormId === 'new' ? 'Novo pagamento' : 'Editar pagamento'}
                </h3>
                {renderPaymentFields(historyForm, setHistoryForm, historyTarget.last_renewed_at || historyTarget.started_at, historyCycleOptions)}
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="button" disabled={historyBusy} onClick={saveHistoryPayment} className="btn-save" style={styles.btnAcc(false)}>
                    {historyBusy ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button type="button" onClick={() => setHistoryFormId(null)} style={styles.btnAcc(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={startNewHistoryPayment} style={{ ...styles.btnAcc(false), marginTop: '12px' }}>
                <PlusCircle size={14} /> Novo pagamento
              </button>
            )}
          </div>
        </div>
      )}

      {historyDeleteTarget && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '360px' }} role="dialog" aria-modal="true">
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, fontSize: '1.05rem' }}>Apagar pagamento?</h2>
              <button onClick={() => setHistoryDeleteTarget(null)} style={styles.modalCloseBtn(false)}>✕</button>
            </div>
            <p style={{ fontSize: '0.88rem', color: styles.sidebarWidgetText?.color }}>
              O pagamento de {fmtDate(historyDeleteTarget.paid_date)} (ciclo de {historyDeleteTarget.cycle_renewal_date ? fmtDate(historyDeleteTarget.cycle_renewal_date) : '—'}) será removido do histórico. Isso não muda a cor/agenda atual da assinatura.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" disabled={historyBusy} onClick={confirmDeleteHistoryPayment} style={{ ...styles.btnAcc(false), backgroundColor: 'hsl(0,75%,55%)', color: '#fff' }}>
                {historyBusy ? 'Apagando...' : 'Sim, apagar'}
              </button>
              <button type="button" onClick={() => setHistoryDeleteTarget(null)} style={styles.btnAcc(false)}>Voltar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
