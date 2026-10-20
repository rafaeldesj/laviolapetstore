import React from 'react';
import { Calculator } from 'lucide-react';
import { NotasFiscais } from './NotasFiscais';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function previousMonthLabel(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

interface ContabilidadeProps {
  styles: any;
}

/** Área do contador: baixar as notas do mês sem depender do dono. Só consulta; não emite nem cancela nada. */
export const Contabilidade: React.FC<ContabilidadeProps> = ({ styles }) => (
  <section style={styles.contentSection} aria-labelledby="contabilidade-heading">
    <div style={styles.crudHeader}>
      <div>
        <h2 id="contabilidade-heading" style={styles.sectionTitle}>
          <Calculator size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
          Contabilidade
          <div style={styles.sectionTitleBar}></div>
        </h2>
        <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
          Escolha o mês e baixe as notas fiscais (XML) e o resumo em planilha, sem precisar pedir ao proprietário.
        </p>
      </div>
    </div>
    <div role="note" style={{
      margin: '16px 0 0', padding: '10px 14px', borderRadius: '8px', fontSize: '0.83rem',
      background: 'hsl(210,85%,45%,0.08)', border: '1px solid hsl(210,85%,45%,0.25)', color: styles.textMain,
    }}>
      📅 Todo mês, o contador precisa receber os arquivos <strong>até o dia 7</strong>. Agora o mês para baixar é{' '}
      <strong>{previousMonthLabel()}</strong> (já vem selecionado abaixo).
    </div>
    <NotasFiscais styles={styles} mode="accounting" />
  </section>
);
