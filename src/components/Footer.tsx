import React, { useState } from 'react';

interface FooterProps {
  styles: any;
}

export const Footer: React.FC<FooterProps> = ({ styles }) => {
  const currentYear = new Date().getFullYear();
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  return (
    <footer style={styles.siteFooter} role="contentinfo">
      <div style={styles.footerContent}>
        <div>
          <h2 style={styles.footerAboutTitle}>La Viola Petshop</h2>
          <p style={styles.footerAboutText}>
            Desde 2018 oferecendo excelência no cuidado animal. Nosso compromisso é com a saúde, a segurança e a felicidade dos pets, em um ambiente totalmente inclusivo e acessível para todos os seus tutores.
          </p>
        </div>

        <div style={styles.footerLinks}>
          <h3 style={styles.footerLinksTitle}>Links Úteis</h3>
          <ul style={styles.footerLinksList}>
            <li>
              <a 
                href="#politica-privacidade" 
                style={styles.footerLinksItemLink(hoveredLink === 'privacy')}
                onMouseEnter={() => setHoveredLink('privacy')}
                onMouseLeave={() => setHoveredLink(null)}
              >
                Política de Privacidade
              </a>
            </li>
            <li>
              <a 
                href="#termos-uso" 
                style={styles.footerLinksItemLink(hoveredLink === 'terms')}
                onMouseEnter={() => setHoveredLink('terms')}
                onMouseLeave={() => setHoveredLink(null)}
              >
                Termos de Uso
              </a>
            </li>
            <li>
              <a 
                href="#declaracao-acessibilidade" 
                style={styles.footerLinksItemLink(hoveredLink === 'accessibility')}
                onMouseEnter={() => setHoveredLink('accessibility')}
                onMouseLeave={() => setHoveredLink(null)}
              >
                Declaração de Acessibilidade
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div style={styles.footerBottom}>
        <p>&copy; {currentYear} La Viola Petshop. Todos os direitos reservados.</p>
        <p>Desenvolvido e Mantido por Rafael Jorge 21 97131-3553.</p>
      </div>
    </footer>
  );
};
