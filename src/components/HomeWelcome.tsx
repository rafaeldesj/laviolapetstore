import React from 'react';
import { Heart, ShieldCheck, Award } from 'lucide-react';

interface HomeWelcomeProps {
  styles: any;
  setActiveSection: (section: string) => void;
}

export const HomeWelcome: React.FC<HomeWelcomeProps> = ({ styles, setActiveSection }) => {
  return (
    <section style={styles.contentSection}>
      <h2 style={styles.sectionTitle}>
        Bem-vindo à Laviola Petstore!
        <div style={styles.sectionTitleBar}></div>
      </h2>
      <p style={{ ...styles.sidebarWidgetText, fontSize: '1.1rem', margin: '20px 0 30px' }}>
        O melhor lugar para cuidar da saúde, beleza e bem-estar do seu animal de estimação em Campo Grande. Oferecemos uma infraestrutura completa com profissionais dedicados e produtos de qualidade premium.
      </p>

      <div style={styles.articlesGrid}>
        <article style={styles.serviceCard(false)}>
          <div style={styles.cardIcon}>
            <Heart size={24} />
          </div>
          <h3 style={styles.serviceCardTitle}>Carinho e Dedicação</h3>
          <p style={styles.serviceCardText}>
            Tratamos cada animal como membro de nossa própria família, proporcionando carinho e segurança durante todas as etapas.
          </p>
        </article>

        <article style={styles.serviceCard(false)}>
          <div style={styles.cardIcon}>
            <ShieldCheck size={24} />
          </div>
          <h3 style={styles.serviceCardTitle}>Segurança Total</h3>
          <p style={styles.serviceCardText}>
            Ambiente higienizado e monitorado, projetado especialmente para garantir o bem-estar e a tranquilidade do seu companheiro.
          </p>
        </article>

        <article style={styles.serviceCard(false)}>
          <div style={styles.cardIcon}>
            <Award size={24} />
          </div>
          <h3 style={styles.serviceCardTitle}>Profissionais Qualificados</h3>
          <p style={styles.serviceCardText}>
            Veterinários e esteticistas qualificados e em constante aperfeiçoamento para oferecer os melhores tratamentos.
          </p>
        </article>
      </div>

      <div style={{ marginTop: '40px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveSection('servicos')}
          style={{
            backgroundColor: styles.logoSvg.color,
            color: '#ffffff',
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          Conhecer Serviços
        </button>
        <button 
          onClick={() => setActiveSection('promocoes')}
          style={{
            backgroundColor: 'transparent',
            color: styles.logoSvg.color,
            padding: '12px 24px',
            border: `2px solid ${styles.logoSvg.color}`,
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          Ver Promoções do Instagram
        </button>
      </div>
    </section>
  );
};
