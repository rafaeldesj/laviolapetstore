import React from 'react';
import { ClipboardList, Stethoscope, PlusCircle } from 'lucide-react';

interface ProntuarioProps {
  styles: any;
}

export const Prontuario: React.FC<ProntuarioProps> = ({ styles }) => {
  return (
    <section style={styles.contentSection} aria-labelledby="prontuario-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="prontuario-heading" style={styles.sectionTitle}>
            <ClipboardList size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
            Prontuário Veterinário
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Histórico médico, vacinas, consultas e tratamentos dos animais.
          </p>
        </div>
        <button style={{ ...styles.btnAcc(false), cursor: 'default', opacity: 0.7 }}>
          <PlusCircle size={16} /> Novo Registro
        </button>
      </div>

      <div style={{
        textAlign: 'center', padding: '60px 20px',
        border: `2px dashed ${styles.borderColor}`, borderRadius: '12px', marginTop: '30px'
      }}>
        <Stethoscope size={48} style={{ color: styles.secondary, margin: '0 auto 16px', display: 'block' }} />
        <h3 style={{ color: styles.primary, fontSize: '1.2rem', margin: '0 0 8px' }}>
          Prontuário Veterinário
        </h3>
        <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.95rem', maxWidth: '440px', margin: '0 auto' }}>
          Este módulo está em desenvolvimento. Em breve os veterinários poderão registrar consultas, prescrições, vacinas e todo o histórico de saúde de cada animal.
        </p>
      </div>
    </section>
  );
};
