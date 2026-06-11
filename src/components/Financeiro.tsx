import React from 'react';
import { Wallet, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface FinanceiroProps {
  styles: any;
}

export const Financeiro: React.FC<FinanceiroProps> = ({ styles }) => {
  const cards = [
    { label: 'Entradas do Mês', value: 'R$ --', icon: <TrendingUp size={20} />, color: 'hsl(142, 60%, 45%)' },
    { label: 'Saídas do Mês',   value: 'R$ --', icon: <TrendingDown size={20} />, color: 'hsl(0, 70%, 50%)' },
    { label: 'Saldo Atual',     value: 'R$ --', icon: <DollarSign size={20} />, color: 'hsl(210, 85%, 45%)' },
  ];

  return (
    <section style={styles.contentSection} aria-labelledby="financeiro-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="financeiro-heading" style={styles.sectionTitle}>
            <Wallet size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
            Financeiro / Caixa
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Entradas, saídas e controle financeiro do petshop.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
        {cards.map(card => (
          <div key={card.label} style={{ ...styles.petCard, gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ color: card.color }}>{card.icon}</div>
              <span style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color }}>{card.label}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{
        textAlign: 'center', padding: '40px 20px',
        border: `2px dashed ${styles.borderColor}`, borderRadius: '12px', marginTop: '24px'
      }}>
        <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.95rem' }}>
          Módulo financeiro em desenvolvimento. O histórico de movimentações e relatórios de caixa estarão disponíveis em breve.
        </p>
      </div>
    </section>
  );
};
