import React from 'react';
import { Package, AlertTriangle, PlusCircle } from 'lucide-react';

interface EstoqueProps {
  styles: any;
}

export const Estoque: React.FC<EstoqueProps> = ({ styles }) => {
  return (
    <section style={styles.contentSection} aria-labelledby="estoque-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="estoque-heading" style={styles.sectionTitle}>
            <Package size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
            Estoque / Produtos
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Controle de produtos, quantidades e alertas de reposição.
          </p>
        </div>
        <button style={{ ...styles.btnAcc(false), cursor: 'default', opacity: 0.7 }}>
          <PlusCircle size={16} /> Novo Produto
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px',
        backgroundColor: 'rgba(255, 165, 0, 0.08)', borderRadius: '10px',
        border: '1px solid rgba(255, 165, 0, 0.25)', marginTop: '20px'
      }}>
        <AlertTriangle size={20} style={{ color: 'hsl(36, 95%, 50%)', flexShrink: 0 }} />
        <p style={{ fontSize: '0.88rem', color: styles.sidebarWidgetText?.color, margin: 0 }}>
          Módulo de estoque em desenvolvimento. Em breve você poderá cadastrar produtos, controlar quantidades e receber alertas de estoque mínimo.
        </p>
      </div>
    </section>
  );
};
