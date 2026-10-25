import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Trash2, Edit3, X, Save, PawPrint, Camera, FileText, Upload, Download,
  Rows3, List, LayoutGrid, Grid2x2, Clock, AlertCircle, UserPlus, Search,
} from 'lucide-react';
import { logAction, roleHierarchy } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';
import { listPets, createPet, updatePet, deletePet } from '../utils/petsService';
import type { Pet } from '../utils/petsService';
import {
  fetchPetPhotoUrl, uploadPetPhoto, deletePetPhoto,
  uploadPetDocument, deletePetDocument, openPetDocument, newDocId,
} from '../utils/petFilesService';
import { listAppointments } from '../utils/agendaService';
import type { Appointment } from '../supabaseClient';
import { searchProducts } from '../utils/productSearch';
import { listUsuarios } from '../utils/profilesService';

interface PetCrudProps {
  currentUser: AuthUser;
  styles: any;
}

type ViewMode = 'details' | 'list' | 'small-cards' | 'large-cards';
const VIEW_KEY = 'lv:pets:view';
const DOC_LABELS = ['Pedigree', 'Documento de identidade', 'Carteira de vacinação', 'Laudo/Exame', 'Outro'];

const readView = (): ViewMode => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'details' || v === 'list' || v === 'small-cards' || v === 'large-cards') return v;
  } catch { /* ignora */ }
  return 'large-cards';
};

interface ClientOption { id: string; name: string; email: string }

export const PetCrud: React.FC<PetCrudProps> = ({ currentUser, styles }) => {
  const userId = currentUser.id;
  const role = currentUser.profile?.role;
  const isStaff = role ? roleHierarchy[role] >= roleHierarchy.collaborator : false;

  const [allPets, setAllPets] = useState<Pet[]>([]);
  const [name, setName] = useState<string>('');
  const [species, setSpecies] = useState<string>('Cão');
  const [breed, setBreed] = useState<string>('');
  const [age, setAge] = useState<number>(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPhotoFile, setFormPhotoFile] = useState<File | null>(null);

  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // Equipe: também vê os pets sem dono, prontos para vincular a um cliente.
  const [showUnowned, setShowUnowned] = useState<boolean>(false);
  const pets = showUnowned ? allPets.filter(p => !p.owner_id) : allPets.filter(p => p.owner_id === userId);
  const unownedCount = allPets.filter(p => !p.owner_id).length;

  const [viewMode, setViewMode] = useState<ViewMode>(readView);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, viewMode); } catch { /* ignora */ } }, [viewMode]);

  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const photosRef = useRef<Record<string, string | null>>({});
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => { Object.values(photosRef.current).forEach(u => u && URL.revokeObjectURL(u)); }, []);

  const loadPhotos = async (list: Pet[]) => {
    const results = await Promise.all(list.map(async p => {
      try { return [p.id, await fetchPetPhotoUrl(p.id)] as const; } catch { return [p.id, null] as const; }
    }));
    setPhotos(prev => {
      Object.entries(prev).forEach(([id, url]) => { if (url && !results.some(([rid]) => rid === id)) URL.revokeObjectURL(url); });
      return Object.fromEntries(results);
    });
  };

  // Detalhe do pet: documentos e histórico de atendimentos (Banho e Tosa / Clubinho).
  const [detailPet, setDetailPet] = useState<Pet | null>(null);
  const [history, setHistory] = useState<Appointment[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [docLabel, setDocLabel] = useState<string>(DOC_LABELS[0]);
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  // Vincular dono (só equipe)
  const [assigningPetId, setAssigningPetId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [ownerSearch, setOwnerSearch] = useState<string>('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState<boolean>(false);

  useEffect(() => {
    fetchPets();
  }, [userId]);

  const fetchPets = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await listPets();
      setAllPets(data);
      const visible = isStaff ? data : data.filter(p => p.owner_id === userId);
      void loadPhotos(visible);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar os pets.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !breed || age < 0) {
      setErrorMsg('Preencha todos os campos corretamente.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const pet = await createPet({ name, species, breed, age });
      if (formPhotoFile) {
        try { await uploadPetPhoto(pet.id, formPhotoFile); } catch (e: any) { setErrorMsg(`Pet cadastrado, mas a foto não foi salva: ${e.message || e}`); }
      }
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Tutor',
        'Cadastro de Pet',
        `O pet "${name}" (Espécie: ${species}, Raça: ${breed}, Idade: ${age}) foi cadastrado.`
      );
      setName('');
      setSpecies('Cão');
      setBreed('');
      setAge(0);
      setFormPhotoFile(null);
      setIsAdding(false);
      fetchPets();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar pet.');
      setIsLoading(false);
    }
  };

  const handleUpdatePet = async (petId: string) => {
    if (!name || !breed || age < 0) {
      setErrorMsg('Preencha todos os campos corretamente para salvar.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);

    try {
      await updatePet(petId, { name, species, breed, age });
      if (formPhotoFile) {
        try { await uploadPetPhoto(petId, formPhotoFile); } catch (e: any) { setErrorMsg(`Dados salvos, mas a foto não foi atualizada: ${e.message || e}`); }
      }
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Tutor',
        'Edição de Pet',
        `O pet "${name}" (ID: ${petId}, Espécie: ${species}, Raça: ${breed}, Idade: ${age}) foi editado.`
      );
      setEditingId(null);
      setName('');
      setSpecies('Cão');
      setBreed('');
      setAge(0);
      setFormPhotoFile(null);
      fetchPets();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar pet.');
      setIsLoading(false);
    }
  };

  const handleDeletePet = async (petId: string) => {
    if (!confirm('Deseja realmente remover este pet?')) return;
    setIsLoading(true);
    setErrorMsg(null);
    const petToDelete = allPets.find(p => p.id === petId);
    const petName = petToDelete ? petToDelete.name : 'Pet';
    try {
      await deletePet(petId);
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Tutor',
        'Exclusão de Pet',
        `O pet "${petName}" (ID: ${petId}) foi excluído do sistema.`
      );
      if (detailPet?.id === petId) setDetailPet(null);
      fetchPets();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao deletar pet.');
      setIsLoading(false);
    }
  };

  const startEdit = (pet: Pet) => {
    setEditingId(pet.id);
    setName(pet.name);
    setSpecies(pet.species || 'Outro');
    setBreed(pet.breed || '');
    setAge(pet.age || 0);
    setFormPhotoFile(null);
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setSpecies('Cão');
    setBreed('');
    setAge(0);
    setFormPhotoFile(null);
  };

  // ---- Detalhe: histórico (Banho e Tosa / Clubinho) e documentos ----
  const openDetail = async (pet: Pet) => {
    setDetailPet(pet);
    setHistory(null);
    setHistoryError(null);
    setDocError(null);
    try {
      const now = new Date();
      // Vai até o início da agenda importada do sistema antigo (2023), pra não cortar o histórico de pets antigos.
      const from = new Date(2023, 0, 1);
      const to = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      const all = await listAppointments(from, to);
      // Agendamentos lançados pela tela de hoje já trazem o pet_id certo; os antigos (agenda importada do
      // sistema anterior) nunca tiveram esse vínculo, só o nome — por isso cai para o nome quando não achar pelo id.
      const petNameNorm = pet.name.trim().toLowerCase();
      setHistory(
        all
          .filter(a => (a.pet_id && a.pet_id === pet.id) || (!a.pet_id && a.pet_name?.trim().toLowerCase() === petNameNorm))
          .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
      );
    } catch (e: any) {
      setHistoryError(e.message || 'Não foi possível carregar o histórico agora.');
    }
  };

  const handleUploadDoc = async (file: File) => {
    if (!detailPet) return;
    setUploadingDoc(true);
    setDocError(null);
    try {
      const docs = await uploadPetDocument(detailPet.id, newDocId(), file, docLabel);
      setDetailPet({ ...detailPet, documents: docs });
      setAllPets(prev => prev.map(p => (p.id === detailPet.id ? { ...p, documents: docs } : p)));
    } catch (e: any) {
      setDocError(e.message || 'Não foi possível anexar o documento.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!detailPet || !confirm('Remover este documento?')) return;
    setBusyDocId(docId);
    setDocError(null);
    try {
      const docs = await deletePetDocument(detailPet.id, docId);
      setDetailPet({ ...detailPet, documents: docs });
      setAllPets(prev => prev.map(p => (p.id === detailPet.id ? { ...p, documents: docs } : p)));
    } catch (e: any) {
      setDocError(e.message || 'Não foi possível remover o documento.');
    } finally {
      setBusyDocId(null);
    }
  };

  // ---- Vincular dono (equipe) ----
  const openAssign = async (petId: string) => {
    setAssigningPetId(petId);
    setOwnerSearch('');
    setAssignError(null);
    if (clients.length === 0) {
      try {
        const usuarios = await listUsuarios();
        const normRole = (r: string) => (r === 'cliente' ? 'client' : r);
        setClients(
          usuarios
            .filter((u: any) => normRole(u.role) === 'client')
            .map((u: any) => ({ id: u.id, name: u.full_name || u.name || 'Cliente', email: u.email || '' }))
        );
      } catch (e: any) {
        setAssignError('Não foi possível carregar a lista de clientes.');
      }
    }
  };

  const assignOwner = async (clientId: string) => {
    if (!assigningPetId) return;
    setAssignBusy(true);
    setAssignError(null);
    try {
      await updatePet(assigningPetId, { owner_id: clientId });
      setAssigningPetId(null);
      fetchPets();
    } catch (e: any) {
      setAssignError(e.message || 'Não foi possível vincular o dono.');
    } finally {
      setAssignBusy(false);
    }
  };

  const clientResults = ownerSearch.trim() ? searchProducts(clients.map(c => ({ ...c, sku: c.email })), ownerSearch, 8).items : clients.slice(0, 8);

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ---- Visual ----
  const modeBtn = (mode: ViewMode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setViewMode(mode)}
      aria-pressed={viewMode === mode}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: 'none',
        backgroundColor: viewMode === mode ? styles.primary : 'transparent',
        color: viewMode === mode ? '#fff' : styles.textMain,
      }}
    >
      {icon} {label}
    </button>
  );

  const avatar = (pet: Pet, size: number) => {
    const url = photos[pet.id];
    return url ? (
      <img src={url} alt={`Foto de ${pet.name}`} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${styles.borderColor}` }} />
    ) : (
      <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, backgroundColor: styles.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: styles.secondary }}>
        <PawPrint size={Math.round(size * 0.5)} />
      </div>
    );
  };

  const petActions = (pet: Pet) => (
    <div style={{ display: 'flex', gap: '6px' }}>
      {isStaff && !pet.owner_id && (
        <button
          onClick={(e) => { e.stopPropagation(); openAssign(pet.id); }}
          className="btn-action-icon"
          style={{ backgroundColor: 'hsl(210,85%,45%,0.1)', color: 'hsl(210,85%,40%)' }}
          title="Vincular a um cliente"
          aria-label={`Vincular ${pet.name} a um cliente`}
        >
          <UserPlus size={14} />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); startEdit(pet); }}
        className="btn-action-icon"
        style={{ backgroundColor: styles.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', color: styles.textMain }}
        title="Editar Pet"
        aria-label={`Editar pet ${pet.name}`}
      >
        <Edit3 size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleDeletePet(pet.id); }}
        className="btn-action-icon btn-action-danger"
        title="Excluir Pet"
        aria-label={`Excluir pet ${pet.name}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  return (
    <section style={styles.contentSection} aria-labelledby="pets-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="pets-heading" style={styles.sectionTitle}>
            {showUnowned ? 'Pets sem tutor vinculado' : 'Meus Pets'}
            <div style={styles.sectionTitleBar}></div>
          </h2>
          {showUnowned && (
            <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
              Vieram da agenda antiga, sem conta de cliente vinculada ainda. O nome ao lado é uma dica de quem é o tutor.
            </p>
          )}
        </div>

        {!isAdding && !editingId && (
          <button
            onClick={() => setIsAdding(true)}
            style={styles.btnAcc(hoveredBtn === 'new-pet')}
            onMouseEnter={() => setHoveredBtn('new-pet')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            <Plus size={16} /> Cadastrar Pet
          </button>
        )}
      </div>

      {isStaff && unownedCount > 0 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, color: styles.textMain, marginTop: '12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showUnowned} onChange={(e) => setShowUnowned(e.target.checked)} />
          Ver pets sem tutor vinculado ({unownedCount})
        </label>
      )}

      {errorMsg && (
        <div style={{ color: 'hsl(0,75%,45%)', fontSize: '0.85rem', margin: '15px 0', padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)', borderRadius: '6px', border: '1px solid hsl(0,75%,55%,0.25)' }}>
          {errorMsg}
        </div>
      )}

      {(isAdding || editingId) && (
        <form onSubmit={isAdding ? handleAddPet : (e) => { e.preventDefault(); handleUpdatePet(editingId!); }} style={{ ...styles.modalForm, margin: '20px 0', padding: '20px', border: `1px solid ${styles.borderColor}`, borderRadius: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 10px 0', color: styles.primary }}>
            {isAdding ? 'Novo Pet' : 'Editar Pet'}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {editingId ? avatar(allPets.find(p => p.id === editingId) || ({} as Pet), 64) : (
              <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: styles.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: styles.secondary }}>
                <PawPrint size={30} />
              </div>
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: styles.textMain }}>
              <Camera size={15} /> {formPhotoFile ? formPhotoFile.name : 'Escolher foto'}
              <input type="file" accept="image/jpeg,image/png" style={{ display: 'none' }} onChange={(e) => setFormPhotoFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div style={styles.formGroup}>
              <label htmlFor="pet-form-name" style={styles.formLabel}>Nome do Pet</label>
              <input id="pet-form-name" type="text" value={name} onChange={(e) => setName(e.target.value)} style={styles.formInput} placeholder="Ex: Rex" disabled={isLoading} />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="pet-form-species" style={styles.formLabel}>Espécie</label>
              <select id="pet-form-species" value={species} onChange={(e) => setSpecies(e.target.value)} style={styles.formInput} disabled={isLoading}>
                <option value="Cão">Cão</option>
                <option value="Gato">Gato</option>
                <option value="Ave">Ave</option>
                <option value="Roedor">Roedor</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="pet-form-breed" style={styles.formLabel}>Raça</label>
              <input id="pet-form-breed" type="text" value={breed} onChange={(e) => setBreed(e.target.value)} style={styles.formInput} placeholder="Ex: Golden Retriever" disabled={isLoading} />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="pet-form-age" style={styles.formLabel}>Idade (Anos)</label>
              <input id="pet-form-age" type="number" value={age} onChange={(e) => setAge(parseInt(e.target.value) || 0)} style={styles.formInput} min="0" disabled={isLoading} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-save"
              style={{ ...styles.btnAcc(hoveredBtn === 'save-pet'), backgroundColor: undefined, borderColor: undefined }}
              onMouseEnter={() => setHoveredBtn('save-pet')}
              onMouseLeave={() => setHoveredBtn(null)}
            >
              <Save size={16} /> Salvar
            </button>
            <button
              type="button"
              onClick={isAdding ? () => { setIsAdding(false); setFormPhotoFile(null); } : cancelEdit}
              style={styles.btnAcc(hoveredBtn === 'cancel-pet')}
              onMouseEnter={() => setHoveredBtn('cancel-pet')}
              onMouseLeave={() => setHoveredBtn(null)}
            >
              <X size={16} /> Cancelar
            </button>
          </div>
        </form>
      )}

      {pets.length > 0 && (
        <div role="group" aria-label="Forma de visualização" style={{ display: 'inline-flex', border: `1px solid ${styles.borderColor}`, borderRadius: '8px', overflow: 'hidden', marginTop: '16px' }}>
          {modeBtn('details', 'Detalhes', <Rows3 size={14} />)}
          {modeBtn('list', 'Lista', <List size={14} />)}
          {modeBtn('small-cards', 'Cards pequenos', <LayoutGrid size={14} />)}
          {modeBtn('large-cards', 'Cards grandes', <Grid2x2 size={14} />)}
        </div>
      )}

      {isLoading && allPets.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText.color, marginTop: '16px' }}>Carregando seus pets...</p>
      ) : pets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: `1px dashed ${styles.borderColor}`, borderRadius: '12px', marginTop: '20px' }}>
          <PawPrint size={40} style={{ color: styles.secondary, margin: '0 auto 10px', display: 'block' }} />
          <p style={{ color: styles.sidebarWidgetText.color, fontWeight: 500 }}>
            {showUnowned ? 'Nenhum pet sem tutor no momento.' : 'Nenhum pet cadastrado ainda.'}
          </p>
        </div>
      ) : viewMode === 'details' ? (
        <div style={{ overflowX: 'auto', border: `1px solid ${styles.borderColor}`, borderRadius: '10px', marginTop: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {(() => {
                  const thBase: React.CSSProperties = {
                    padding: '8px 10px', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color,
                    position: 'sticky', top: 0, zIndex: 2,
                    backgroundColor: styles.isDark ? '#1e2130' : '#f4f5f7',
                    boxShadow: `inset 0 -1px 0 ${styles.borderColor}`,
                  };
                  return (
                    <>
                      <th style={{ ...thBase, textAlign: 'left' }}></th>
                      <th style={{ ...thBase, textAlign: 'left' }}>Nome</th>
                      <th style={{ ...thBase, textAlign: 'left' }}>Espécie</th>
                      <th style={{ ...thBase, textAlign: 'left' }}>Raça</th>
                      <th style={{ ...thBase, textAlign: 'right' }}>Idade</th>
                      {showUnowned && <th style={{ ...thBase, textAlign: 'left' }}>Tutor (dica)</th>}
                      <th style={{ ...thBase, textAlign: 'right' }}>Documentos</th>
                      <th style={thBase}></th>
                    </>
                  );
                })()}
              </tr>
            </thead>
            <tbody>
              {pets.map(pet => (
                <tr key={pet.id} onClick={() => openDetail(pet)} style={{ borderTop: `1px solid ${styles.borderColor}`, cursor: 'pointer' }}>
                  <td style={{ padding: '6px 10px' }}>{avatar(pet, 32)}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: styles.textMain }}>{pet.name}</td>
                  <td style={{ padding: '8px 10px', color: styles.textMain }}>{pet.species}</td>
                  <td style={{ padding: '8px 10px', color: styles.textMain }}>{pet.breed}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: styles.textMain }}>{pet.age} {pet.age === 1 ? 'ano' : 'anos'}</td>
                  {showUnowned && <td style={{ padding: '8px 10px', color: styles.sidebarWidgetText?.color }}>{pet.tutor_hint || '—'}</td>}
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: styles.sidebarWidgetText?.color }}>{(pet.documents || []).length}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>{petActions(pet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
          {pets.map(pet => (
            <article
              key={pet.id}
              onClick={() => openDetail(pet)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', border: `1px solid ${styles.borderColor}`, borderRadius: '10px', cursor: 'pointer', backgroundColor: styles.cardBackground || styles.background }}
            >
              {avatar(pet, 40)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ color: styles.textMain, fontSize: '0.92rem' }}>{pet.name}</strong>
                <span style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.8rem', marginLeft: '8px' }}>
                  {pet.species} · {pet.breed || 'raça não informada'} · {pet.age} {pet.age === 1 ? 'ano' : 'anos'}
                  {showUnowned && pet.tutor_hint ? ` · tutor: ${pet.tutor_hint}` : ''}
                </span>
              </div>
              <div onClick={(e) => e.stopPropagation()}>{petActions(pet)}</div>
            </article>
          ))}
        </div>
      ) : viewMode === 'small-cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '14px', marginTop: '16px' }}>
          {pets.map(pet => (
            <article
              key={pet.id}
              onClick={() => openDetail(pet)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '14px 10px', border: `1px solid ${styles.borderColor}`, borderRadius: '12px', cursor: 'pointer', backgroundColor: styles.cardBackground || styles.background, textAlign: 'center' }}
            >
              {avatar(pet, 64)}
              <strong style={{ color: styles.textMain, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{pet.name}</strong>
              <span style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.72rem' }}>{pet.species}</span>
              <div onClick={(e) => e.stopPropagation()}>{petActions(pet)}</div>
            </article>
          ))}
        </div>
      ) : (
        <div style={styles.crudList}>
          {pets.map((pet) => (
            <article key={pet.id} onClick={() => openDetail(pet)} style={{ ...styles.petCard, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>{avatar(pet, 84)}</div>
              <div style={styles.petHeader}>
                <h3 style={styles.petName}>{pet.name}</h3>
                <span style={styles.petBadge}>{pet.species}</span>
              </div>
              <div style={styles.petDetail}>
                <span>Raça:</span>
                <strong>{pet.breed || 'não informada'}</strong>
              </div>
              <div style={styles.petDetail}>
                <span>Idade:</span>
                <strong>{pet.age} {pet.age === 1 ? 'ano' : 'anos'}</strong>
              </div>
              {showUnowned && pet.tutor_hint && (
                <div style={styles.petDetail}>
                  <span>Tutor (dica):</span>
                  <strong>{pet.tutor_hint}</strong>
                </div>
              )}
              {(pet.documents || []).length > 0 && (
                <div style={styles.petDetail}>
                  <span>Documentos:</span>
                  <strong>{(pet.documents || []).length}</strong>
                </div>
              )}
              <div style={styles.petActions} onClick={(e) => e.stopPropagation()}>{petActions(pet)}</div>
            </article>
          ))}
        </div>
      )}

      {/* MODAL: vincular dono (equipe) */}
      {assigningPetId && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '420px' }} role="dialog" aria-modal="true" aria-labelledby="assign-owner-title">
            <div style={styles.modalHeader}>
              <h2 id="assign-owner-title" style={{ ...styles.modalTitle, fontSize: '1.1rem' }}>Vincular a um cliente</h2>
              <button onClick={() => setAssigningPetId(null)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>
            <div style={{ position: 'relative' }}>
              <input type="text" value={ownerSearch} onChange={(e) => setOwnerSearch(e.target.value)} placeholder="Buscar cliente por nome ou e-mail..." style={{ ...styles.formInput, width: '100%', paddingLeft: '34px' }} autoFocus />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
            </div>
            {assignError && <div role="alert" style={{ color: 'hsl(0,75%,45%)', fontSize: '0.82rem' }}>{assignError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
              {clientResults.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color, textAlign: 'center' }}>Nenhum cliente encontrado.</p>
              ) : clientResults.map(c => (
                <button
                  key={c.id}
                  type="button"
                  disabled={assignBusy}
                  onClick={() => assignOwner(c.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px', border: `1px solid ${styles.borderColor}`, borderRadius: '8px', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <strong style={{ fontSize: '0.85rem', color: styles.textMain }}>{c.name}</strong>
                  <span style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color }}>{c.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: detalhe do pet — documentos e histórico */}
      {detailPet && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-labelledby="pet-detail-title">
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {avatar(detailPet, 54)}
                <div>
                  <h2 id="pet-detail-title" style={{ ...styles.modalTitle, fontSize: '1.2rem' }}>{detailPet.name}</h2>
                  <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>{detailPet.species} · {detailPet.breed || 'raça não informada'} · {detailPet.age} {detailPet.age === 1 ? 'ano' : 'anos'}</span>
                  {!detailPet.owner_id && <div style={{ fontSize: '0.75rem', color: 'hsl(36,95%,40%)', fontWeight: 700 }}>⚠ Sem tutor vinculado{detailPet.tutor_hint ? ` (dica: ${detailPet.tutor_hint})` : ''}</div>}
                </div>
              </div>
              <button onClick={() => setDetailPet(null)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <button type="button" onClick={() => { startEdit(detailPet); setDetailPet(null); }} style={{ ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem' }}>
                <Edit3 size={14} /> Editar pet
              </button>
              {isStaff && !detailPet.owner_id && (
                <button type="button" onClick={() => { const id = detailPet.id; setDetailPet(null); openAssign(id); }} style={{ ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem' }}>
                  <UserPlus size={14} /> Vincular a um cliente
                </button>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${styles.borderColor}`, paddingTop: '14px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: styles.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={16} style={{ color: styles.primary }} /> Documentos
              </h3>

              {(detailPet.documents || []).length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color, margin: '0 0 10px' }}>Nenhum documento anexado ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                  {(detailPet.documents || []).map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', border: `1px solid ${styles.borderColor}`, borderRadius: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: '0.85rem', color: styles.textMain }}>{d.label}</strong>
                        <div style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color }}>anexado em {new Date(d.uploaded_at).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button type="button" disabled={busyDocId === d.id} onClick={() => openPetDocument(detailPet.id, d.id)} title="Ver / baixar" style={{ ...styles.btnAcc(false), padding: '5px 9px', fontSize: '0.74rem' }}>
                          <Download size={13} />
                        </button>
                        <button type="button" disabled={busyDocId === d.id} onClick={() => handleDeleteDoc(d.id)} className="btn-action-icon btn-action-danger" title="Remover">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <select value={docLabel} onChange={(e) => setDocLabel(e.target.value)} style={{ ...styles.formInput, width: 'auto', padding: '7px 10px', fontSize: '0.8rem' }}>
                  {DOC_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: `1px solid ${styles.primary}`, cursor: uploadingDoc ? 'wait' : 'pointer', fontSize: '0.8rem', fontWeight: 700, color: styles.primary, opacity: uploadingDoc ? 0.6 : 1 }}>
                  <Upload size={14} /> {uploadingDoc ? 'Enviando...' : 'Anexar arquivo (foto ou PDF)'}
                  <input type="file" accept="image/jpeg,image/png,application/pdf" disabled={uploadingDoc} style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleUploadDoc(f); }} />
                </label>
              </div>
              {docError && <div role="alert" style={{ color: 'hsl(0,75%,45%)', fontSize: '0.8rem', marginTop: '6px' }}>{docError}</div>}
            </div>

            <div style={{ borderTop: `1px solid ${styles.borderColor}`, paddingTop: '14px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: styles.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} style={{ color: styles.primary }} /> Histórico no La Viola
              </h3>

              {historyError ? (
                <div role="alert" style={{ display: 'flex', gap: '6px', alignItems: 'center', color: 'hsl(0,75%,45%)', fontSize: '0.82rem' }}>
                  <AlertCircle size={14} /> {historyError}
                </div>
              ) : history === null ? (
                <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>Carregando...</p>
              ) : history.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>Nenhum atendimento registrado para {detailPet.name} ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '320px', overflowY: 'auto' }}>
                  {/* Agrupado por tipo de atendimento (Banho & Tosa, Vacinação, etc.) — tudo que já existe na agenda. */}
                  {Object.entries(
                    history.reduce<Record<string, Appointment[]>>((groups, h) => {
                      const key = h.service_type || 'Outro';
                      (groups[key] = groups[key] || []).push(h);
                      return groups;
                    }, {})
                  ).map(([category, items]) => (
                    <div key={category}>
                      <h4 style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 700, color: styles.primary, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {category} <span style={{ fontWeight: 500, color: styles.sidebarWidgetText?.color }}>({items.length})</span>
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {items.map(h => (
                          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '7px 10px', border: `1px solid ${styles.borderColor}`, borderRadius: '8px', fontSize: '0.82rem' }}>
                            <span style={{ color: styles.sidebarWidgetText?.color }}>{fmtDate(h.scheduled_at)}</span>
                            <span style={{ color: styles.textMain, fontWeight: 600 }}>{h.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize: '0.74rem', color: styles.sidebarWidgetText?.color, marginTop: '10px' }}>
                Isto mostra o que já está na agenda (banhos, tosas, vacinas etc.). Um prontuário veterinário completo (consultas, prescrições, exames) ainda está em desenvolvimento e vai aparecer aqui quando estiver pronto.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
