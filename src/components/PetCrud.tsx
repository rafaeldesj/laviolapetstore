import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit3, X, Save, PawPrint } from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured, logAction } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: number;
  owner_id: string;
}

interface PetCrudProps {
  userId: string;
  styles: any;
}

export const PetCrud: React.FC<PetCrudProps> = ({ userId, styles }) => {
  const { user: currentUser } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [name, setName] = useState<string>('');
  const [species, setSpecies] = useState<string>('Cão');
  const [breed, setBreed] = useState<string>('');
  const [age, setAge] = useState<number>(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  useEffect(() => {
    fetchPets();
  }, [userId]);

  const fetchPets = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('pets')
          .select('*')
          .eq('owner_id', userId);
        if (error) throw error;
        setPets(data || []);
      } else {
        const { data } = await mockSupabaseDb.getPets(userId);
        setPets(data || []);
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
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('pets')
          .insert({ ...newPetData, owner_id: userId });
        if (error) throw error;
      } else {
        await mockSupabaseDb.addPet(newPetData, userId);
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
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('pets')
          .update(updatedData)
          .eq('id', petId);
        if (error) throw error;
      } else {
        await mockSupabaseDb.updatePet(petId, updatedData);
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
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('pets')
          .delete()
          .eq('id', petId);
        if (error) throw error;
      } else {
        await mockSupabaseDb.deletePet(petId);
      }
      await logAction(
        currentUser?.email || '',
        currentUser?.name || 'Tutor',
        'Exclusão de Pet',
        `O pet "${petName}" (ID: ${petId}) foi excluído do sistema.`
      );
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
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setSpecies('Cão');
    setBreed('');
    setAge(0);
  };

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
        <div style={{ color: 'red', fontSize: '0.9rem', margin: '15px 0' }}>
          {errorMsg}
        </div>
      )}

      {(isAdding || editingId) && (
        <form onSubmit={isAdding ? handleAddPet : (e) => { e.preventDefault(); handleUpdatePet(editingId!); }} style={{ ...styles.modalForm, margin: '20px 0', padding: '20px', border: `1px solid ${styles.borderColor}`, borderRadius: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 10px 0', color: styles.primary }}>
            {isAdding ? 'Novo Pet' : 'Editar Pet'}
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div style={styles.formGroup}>
              <label htmlFor="pet-form-name" style={styles.formLabel}>Nome do Pet</label>
              <input
                id="pet-form-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.formInput}
                placeholder="Ex: Rex"
                disabled={isLoading}
              />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="pet-form-species" style={styles.formLabel}>Espécie</label>
              <select
                id="pet-form-species"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                style={styles.formInput}
                disabled={isLoading}
              >
                <option value="Cão">Cão</option>
                <option value="Gato">Gato</option>
                <option value="Ave">Ave</option>
                <option value="Roedor">Roedor</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="pet-form-breed" style={styles.formLabel}>Raça</label>
              <input
                id="pet-form-breed"
                type="text"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                style={styles.formInput}
                placeholder="Ex: Golden Retriever"
                disabled={isLoading}
              />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="pet-form-age" style={styles.formLabel}>Idade (Anos)</label>
              <input
                id="pet-form-age"
                type="number"
                value={age}
                onChange={(e) => setAge(parseInt(e.target.value) || 0)}
                style={styles.formInput}
                min="0"
                disabled={isLoading}
              />
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
              onClick={isAdding ? () => setIsAdding(false) : cancelEdit}
              style={styles.btnAcc(hoveredBtn === 'cancel-pet')}
              onMouseEnter={() => setHoveredBtn('cancel-pet')}
              onMouseLeave={() => setHoveredBtn(null)}
            >
              <X size={16} /> Cancelar
            </button>
          </div>
        </form>
      )}

      {isLoading && pets.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText.color }}>Carregando seus pets...</p>
      ) : pets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: `1px dashed ${styles.borderColor}`, borderRadius: '12px', marginTop: '20px' }}>
          <PawPrint size={40} style={{ color: styles.secondary, margin: '0 auto 10px', display: 'block' }} />
          <p style={{ color: styles.sidebarWidgetText.color, fontWeight: 500 }}>Nenhum pet cadastrado ainda.</p>
        </div>
      ) : (
        <div style={styles.crudList}>
          {pets.map((pet) => (
            <article key={pet.id} style={styles.petCard}>
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
              <div style={styles.petActions}>
                <button
                  onClick={() => startEdit(pet)}
                  className="btn-action-icon"
                  style={{
                    backgroundColor: styles.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                    color: styles.textMain,
                  }}
                  title="Editar Pet"
                  aria-label={`Editar pet ${pet.name}`}
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => handleDeletePet(pet.id)}
                  className="btn-action-icon btn-action-danger"
                  title="Excluir Pet"
                  aria-label={`Excluir pet ${pet.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
