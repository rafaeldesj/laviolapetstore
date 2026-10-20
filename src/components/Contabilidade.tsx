import React from 'react';
import { Calculator } from 'lucide-react';
import { NotasFiscais } from './NotasFiscais';

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
    <NotasFiscais styles={styles} mode="accounting" />
  </section>
);
