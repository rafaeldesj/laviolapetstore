import React, { useState } from 'react';
import { Tag, Sparkles, ShoppingBag, Truck } from 'lucide-react';

interface PromotionsProps {
  styles: any;
  setActiveSection: (section: string) => void;
  isLoggedIn: boolean;
  userRole?: string;
  setSelectedProduct: (product: { name: string; price: number } | null) => void;
  onLoginClick: () => void;
}

export const Promotions: React.FC<PromotionsProps> = ({ 
  styles, 
  setActiveSection, 
  isLoggedIn, 
  userRole, 
  setSelectedProduct, 
  onLoginClick 
}) => {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const promoItems = [
    {
      badge: 'Oferta Especial',
      title: 'Ração Quatree Carne (15kg)',
      price: 'R$ 119,90',
      numericPrice: 119.90,
      description: 'Nutrição de alta qualidade para cães adultos com energia e sabor irresistíveis.',
      details: 'Disponível para pronta entrega.',
      icon: <ShoppingBag size={20} />
    },
    {
      badge: 'Desconto Dinheiro/PIX',
      title: 'Ração Golden Fórmula (15kg)',
      price: 'R$ 149,99',
      numericPrice: 149.99,
      description: 'Fórmula premium desenvolvida para cães exigentes, rica em nutrientes e vitaminas.',
      details: 'Valor exclusivo para retirada em loja ou pagamento via PIX/Dinheiro.',
      icon: <Tag size={20} />
    },
    {
      badge: 'Personalizado',
      title: 'Arranhadores para Gatos',
      price: 'R$ 180,00',
      numericPrice: 180.00,
      description: 'Modelos artesanais sob medida para o bem-estar e diversão do seu gato.',
      details: 'Disponível para pronta entrega ou encomenda.',
      icon: <Sparkles size={20} />
    }
  ];

  const handleBuy = (item: any) => {
    if (!isLoggedIn) {
      alert('Por favor, faça login ou cadastre-se para realizar a compra deste produto.');
      onLoginClick();
      return;
    }
    if (userRole && userRole !== 'client') {
      alert('Apenas clientes podem efetuar compras de produtos no painel online. Para vendas de colaboradores/gerentes, utilize a tela "Venda Avulsa PDV".');
      return;
    }
    setSelectedProduct({ name: item.title, price: item.numericPrice });
    setActiveSection('pagamentos');
  };

  return (
    <section style={styles.contentSection} id="promocoes" aria-labelledby="promotions-heading">
      <h2 id="promotions-heading" style={styles.sectionTitle}>
        Destaques do Instagram
        <div style={styles.sectionTitleBar}></div>
      </h2>
      <p style={{ color: styles.sidebarWidgetText.color, marginBottom: '30px' }}>
        Acompanhe nossas últimas ofertas e novidades diretamente de nossa rede social. Aproveite os preços especiais!
      </p>

      <div style={styles.articlesGrid}>
        {promoItems.map((item, index) => (
          <article 
            style={styles.serviceCard(hoveredCard === index, true)} 
            key={index}
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ 
                backgroundColor: 'rgba(36, 95%, 55%, 0.1)', 
                color: styles.hoursListSpecial.color, 
                padding: '4px 10px', 
                borderRadius: '20px', 
                fontSize: '0.75rem',
                fontWeight: 700 
              }}>
                {item.badge}
              </span>
              <span style={{ color: styles.logoSvg.color }}>
                {item.icon}
              </span>
            </div>
            <h3 style={{ ...styles.serviceCardTitle, marginTop: '10px' }}>{item.title}</h3>
            <p style={styles.serviceCardText}>{item.description}</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: styles.logoSvg.color, margin: '8px 0' }}>
              {item.price}
            </p>
            <p style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText.color, fontStyle: 'italic', marginBottom: '15px' }}>
              {item.details}
            </p>
            
            <button
              onClick={() => handleBuy(item)}
              style={{
                ...styles.btnAcc(hoveredCard === index),
                width: '100%',
                justifyContent: 'center',
                marginTop: 'auto',
                fontWeight: 700,
                border: 'none',
                backgroundColor: hoveredCard === index ? styles.primaryHover : styles.primary,
                color: '#fff'
              }}
            >
              Comprar Agora
            </button>
          </article>
        ))}
      </div>

      <div style={styles.instagramPromoWidget}>
        <Truck size={32} style={{ color: styles.logoSvg.color, flexShrink: 0 }} aria-hidden="true" />
        <div>
          <h4 style={{ fontWeight: 700, color: styles.bodyStyle.color }}>Serviço de Delivery & Táxi Dog</h4>
          <p style={{ fontSize: '0.9rem', color: styles.sidebarWidgetText.color }}>
            Entregamos suas compras e buscamos seu pet em toda a região de Campo Grande. Faça seu pedido ou agende o transporte pelo WhatsApp: <strong>(21) 97128-2945</strong>.
          </p>
        </div>
      </div>
    </section>
  );
};
