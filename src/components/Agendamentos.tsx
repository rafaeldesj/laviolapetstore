import React from 'react';
import { CalendarDays, Clock, PlusCircle } from 'lucide-react';

interface AgendamentosProps {
  styles: any;
}

export const Agendamentos: React.FC<AgendamentosProps> = ({ styles }) => {
  return (
    <section style={styles.contentSection} aria-labelledby="agendamentos-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="agendamentos-heading" style={styles.sectionTitle}>
            <CalendarDays size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
            Agendamentos
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Gerencie consultas, banhos, tosas e serviços agendados.
          </p>
        </div>
        <button style={{ ...styles.btnAcc(false), cursor: 'default', opacity: 0.7 }}>
          <PlusCircle size={16} /> Novo Agendamento
        </button>
      </div>

      <div style={{
        textAlign: 'center', padding: '60px 20px',
        border: `2px dashed ${styles.borderColor}`, borderRadius: '12px', marginTop: '30px'
      }}>
        <Clock size={48} style={{ color: styles.secondary, margin: '0 auto 16px', display: 'block' }} />
        <h3 style={{ color: styles.primary, fontSize: '1.2rem', margin: '0 0 8px' }}>
          Módulo de Agendamentos
        </h3>
        <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.95rem', maxWidth: '400px', margin: '0 auto' }}>
          Este módulo está em desenvolvimento. Em breve você poderá visualizar, criar e gerenciar todos os agendamentos do petshop por aqui.
        </p>
      </div>
    </section>
  );
};
