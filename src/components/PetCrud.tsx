import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Trash2, Edit3, X, Save, PawPrint, Camera, FileText, Upload, Download,
  Rows3, List, LayoutGrid, Grid2x2, Clock, AlertCircle,
} from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured, logAction } from '../supabaseClient';
import type { PetDocument } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';
import {
  fetchPetPhotoUrl, uploadPetPhoto, deletePetPhoto,
  uploadPetDocument, deletePetDocument, openPetDocument, newDocId,
} from '../utils/petFilesService';
import { listAppointments } from '../utils/agendaService';
import type { Appointment } from '../supabaseClient';

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: number;
  owner_id: string;
  documents?: PetDocument[];
}

interface PetCrudProps {
  userId: string;
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

export const PetCrud: React.FC<PetCrudProps> = ({ userId, styles }) => {
  const { user: currentUser } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
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

  const [viewMode, setViewMode] = useState<ViewMode>(readView);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, viewMode); } catch { /* ignora */ } }, [viewMode]);

  // Fotos: cada pet carrega a própria foto (ou null, se não tiver) e guarda como URL temporária do navegador.
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

  useEffect(() => {
    fetchPets();
  }, [userId]);

  const fetchPets = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (false && supabase) {
        const { data, error } = await supabase
          .from('pets')
          .select('*')
          .eq('owner_id', userId);
        if (error) throw error;
        setPets(data || []);
        void loadPhotos(data || []);
      } else {
        const { data } = await mockSupabaseDb.getPets(userId);
        setPets((data || []) as Pet[]);
        void loadPhotos((data || []) as Pet[]);
      }
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

    const newPetData = { name, species, breed, age };

    try {
      let newId: string | null = null;
      if (false && supabase) {
        const { data, error } = await supabase.from('pets').insert({ ...newPetData, owner_id: userId }).select('id').single();
        if (error) throw error;
        newId = data?.id || null;
      } else {
        const { data } = await mockSupabaseDb.addPet(newPetData, userId);
        newId = data?.id || null;
      }
      if (newId && formPhotoFile) {
        try { await uploadPetPhoto(newId, formPhotoFile); } catch (e: any) { setErrorMsg(`Pet cadastrado, mas a foto não foi salva: ${e.message || e}`); }
      }
      await logAction(
        currentUser?.email || '',
        currentUser?.name || 'Tutor',
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

    const updatedData = { name, species, breed, age };

    try {
      if (false && supabase) {
        const { error } = await supabase.from('pets').update(updatedData).eq('id', petId);
        if (error) throw error;
      } else {
        await mockSupabaseDb.updatePet(petId, updatedData);
      }
      if (formPhotoFile) {
        try { await uploadPetPhoto(petId, formPhotoFile); } catch (e: any) { setErrorMsg(`Dados salvos, mas a foto não foi atualizada: ${e.message || e}`); }
      }
      await logAction(
        currentUser?.email || '',
        currentUser?.name || 'Tutor',
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
    const petToDelete = pets.find(p => p.id === petId);
    const petName = petToDelete ? petToDelete.name : 'Pet';
    try {
      if (false && supabase) {
        const { error } = await supabase.from('pets').delete().eq('id', petId);
        if (error) throw error;
      } else {
        await mockSupabaseDb.deletePet(petId);
      }
      await deletePetPhoto(petId).catch(() => {}); // a foto some junto; se der erro, não impede a exclusão
      await logAction(
        currentUser?.email || '',
        currentUser?.name || 'Tutor',
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
    setSpecies(pet.species);
    setBreed(pet.breed);
    setAge(pet.age);
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
      const from = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
      const to = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      const all = await listAppointments(from, to);
      setHistory(all.filter(a => a.pet_id === pet.id).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)));
    } catch (e: any) {
      setHistoryError(e.message || 'Não foi possível carregar o histórico agora.');
    }
  };

  const handleUploadDoc = async (file: File) => {
    if (!detailPet) return;
    setUploadingDoc(true);
    setDocError(null);
    try {
      const id = newDocId();
      await uploadPetDocument(detailPet.id, id, file);
      const doc: PetDocument = { id, label: docLabel, content_type: file.type || 'application/octet-stream', uploaded_at: new Date().toISOString() };
      const updated = [...(detailPet.documents || []), doc];
      await mockSupabaseDb.updatePet(detailPet.id, { documents: updated });
      setDetailPet({ ...detailPet, documents: updated });
      setPets(prev => prev.map(p => (p.id === detailPet.id ? { ...p, documents: updated } : p)));
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
      await deletePetDocument(detailPet.id, docId);
      const updated = (detailPet.documents || []).filter(d => d.id !== docId);
      await mockSupabaseDb.updatePet(detailPet.id, { documents: updated });
      setDetailPet({ ...detailPet, documents: updated });
      setPets(prev => prev.map(p => (p.id === detailPet.id ? { ...p, documents: updated } : p)));
    } catch (e: any) {
      setDocError(e.message || 'Não foi possível remover o documento.');
    } finally {
      setBusyDocId(null);
    }
  };

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
            Meus Pets
            <div style={styles.sectionTitleBar}></div>
          </h2>
          {!isSupabaseConfigured && (
            <p style={{ fontSize: '0.8rem', color: styles.secondary, marginTop: '5px', fontWeight: 600 }}>
              * Executando em modo de armazenamento local (conecte o Supabase para sincronizar em nuvem).
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
            {editingId ? avatar(pets.find(p => p.id === editingId) || ({} as Pet), 64) : (
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

      {isLoading && pets.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText.color, marginTop: '16px' }}>Carregando seus pets...</p>
      ) : pets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: `1px dashed ${styles.borderColor}`, borderRadius: '12px', marginTop: '20px' }}>
          <PawPrint size={40} style={{ color: styles.secondary, margin: '0 auto 10px', display: 'block' }} />
          <p style={{ color: styles.sidebarWidgetText.color, fontWeight: 500 }}>Nenhum pet cadastrado ainda.</p>
        </div>
      ) : viewMode === 'details' ? (
        <div style={{ overflowX: 'auto', border: `1px solid ${styles.borderColor}`, borderRadius: '10px', marginTop: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: styles.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color }}></th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color }}>Nome</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color }}>Espécie</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color }}>Raça</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color }}>Idade</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color }}>Documentos</th>
                <th style={{ padding: '8px 10px' }}></th>
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
                <span style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.8rem', marginLeft: '8px' }}>{pet.species} · {pet.breed} · {pet.age} {pet.age === 1 ? 'ano' : 'anos'}</span>
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
                <strong>{pet.breed}</strong>
              </div>
              <div style={styles.petDetail}>
                <span>Idade:</span>
                <strong>{pet.age} {pet.age === 1 ? 'ano' : 'anos'}</strong>
              </div>
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

      {/* MODAL: detalhe do pet — documentos e histórico */}
      {detailPet && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-labelledby="pet-detail-title">
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {avatar(detailPet, 54)}
                <div>
                  <h2 id="pet-detail-title" style={{ ...styles.modalTitle, fontSize: '1.2rem' }}>{detailPet.name}</h2>
                  <span style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>{detailPet.species} · {detailPet.breed} · {detailPet.age} {detailPet.age === 1 ? 'ano' : 'anos'}</span>
                </div>
              </div>
              <button onClick={() => setDetailPet(null)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <button type="button" onClick={() => { startEdit(detailPet); setDetailPet(null); }} style={{ ...styles.btnAcc(false), padding: '6px 12px', fontSize: '0.8rem' }}>
                <Edit3 size={14} /> Editar pet
              </button>
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
                <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>Nenhum atendimento de Banho e Tosa / Clubinho registrado para {detailPet.name} ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '7px 10px', border: `1px solid ${styles.borderColor}`, borderRadius: '8px', fontSize: '0.82rem' }}>
                      <span style={{ color: styles.textMain, fontWeight: 600 }}>{h.service_type}</span>
                      <span style={{ color: styles.sidebarWidgetText?.color }}>{fmtDate(h.scheduled_at)}</span>
                      <span style={{ color: styles.textMain }}>{h.status}</span>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize: '0.74rem', color: styles.sidebarWidgetText?.color, marginTop: '10px' }}>
                O prontuário veterinário (consultas, vacinas, prescrições) ainda está em desenvolvimento e vai aparecer aqui quando estiver pronto.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
