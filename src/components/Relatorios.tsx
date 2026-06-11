import React from 'react';
import { BarChart3, PawPrint, CalendarDays, Wallet, Package } from 'lucide-react';

interface RelatoriosProps {
  styles: any;
}

export const Relatorios: React.FC<RelatoriosProps> = ({ styles }) => {
  const kpis = [
    { label: 'Pets Cadastrados', icon: <PawPrint size={22} />, color: styles.primary },
    { label: 'Agendamentos no Mês', icon: <CalendarDays size={22} />, color: 'hsl(210, 85%, 45%)' },
    { label: 'Receita do Mês', icon: <Wallet size={22} />, color: 'hsl(142, 60%, 45%)' },
    { label: 'Produtos no Estoque', icon: <Package size={22} />, color: 'hsl(36, 95%, 50%)' },
  ];

  return (
    <section style={styles.contentSection} aria-labelledby="relatorios-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="relatorios-heading" style={styles.sectionTitle}>
            <BarChart3 size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
            Relatórios
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Visão geral do desempenho e métricas do petshop.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '24px' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{ ...styles.petCard, textAlign: 'center', gap: '12px' }}>
            <div style={{ color: kpi.color }}>{kpi.icon}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: kpi.color }}>—</div>
            <div style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{
        textAlign: 'center', padding: '40px 20px',
        border: `2px dashed ${styles.borderColor}`, borderRadius: '12px', marginTop: '24px'
      }}>
        <BarChart3 size={40} style={{ color: styles.secondary, margin: '0 auto 12px', display: 'block' }} />
        <p style={{ color: styles.sidebarWidgetText?.color, fontSize: '0.95rem', maxWidth: '400px', margin: '0 auto' }}>
          Os gráficos e relatórios detalhados estarão disponíveis em breve, com exportação em PDF e Excel.
        </p>
      </div>
    </section>
  );
};
