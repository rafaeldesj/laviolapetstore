import React, { useState } from 'react';
import { Scissors, Stethoscope, Home, ShoppingBag, ArrowRight } from 'lucide-react';

interface ServicesProps {
  styles: any;
}

export const Services: React.FC<ServicesProps> = ({ styles }) => {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [hoveredMore, setHoveredMore] = useState<number | null>(null);

  const servicesList = [
    {
      icon: <Scissors size={24} aria-hidden="true" />,
      title: 'Banho & Tosa Especializado',
      description: 'Estética animal completa com produtos hipoalergênicos e profissionais apaixonados. Oferecemos hidratação, corte de unhas e limpeza de ouvidos inclusos.',
      link: '#banho-tosa'
    },
    {
      icon: <Stethoscope size={24} aria-hidden="true" />,
      title: 'Consultas & Vacinas',
      description: 'Atendimento veterinário clínico completo para garantir a saúde e a prevenção de doenças do seu melhor amigo, com especialistas dedicados e carinhosos.',
      link: '#veterinario'
    },
    {
      icon: <Home size={24} aria-hidden="true" />,
      title: 'Hotelzinho & Creche',
      description: 'Espaço recreativo amplo e seguro com monitoramento constante. Seu pet brinca, socializa e descansa enquanto você viaja ou trabalha com tranquilidade.',
      link: '#hotel-creche'
    },
    {
      icon: <ShoppingBag size={24} aria-hidden="true" />,
      title: 'Boutique & Farmácia',
      description: 'Uma seleção premium de rações, brinquedos interativos, petiscos saudáveis, acessórios modernos e medicamentos essenciais sob indicação veterinária.',
      link: '#boutique'
    }
  ];

  return (
    <section style={styles.contentSection} id="servicos" aria-labelledby="services-heading">
      <h2 id="services-heading" style={styles.sectionTitle}>
        Nossos Serviços Especiais
        <div style={styles.sectionTitleBar}></div>
      </h2>
      <p style={{ color: styles.sidebarWidgetText.color, marginBottom: '30px' }}>
        Oferecemos soluções completas com infraestrutura planejada e carinho genuíno para garantir a felicidade e a qualidade de vida do seu animal de estimação.
      </p>

      <div style={styles.articlesGrid}>
        {servicesList.map((service, index) => (
          <article 
            style={styles.serviceCard(hoveredCard === index)} 
            key={index}
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div style={styles.cardIcon} aria-hidden="true">
              {service.icon}
            </div>
            <h3 style={styles.serviceCardTitle}>{service.title}</h3>
            <p style={styles.serviceCardText}>{service.description}</p>
            <a 
              href={service.link} 
              style={styles.btnMore(hoveredMore === index)}
              onMouseEnter={() => setHoveredMore(index)}
              onMouseLeave={() => setHoveredMore(null)}
              aria-label={`Saber mais sobre ${service.title}`}
            >
              Saber mais <ArrowRight size={16} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
};
