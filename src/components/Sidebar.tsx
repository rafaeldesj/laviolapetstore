import React from 'react';
import { Phone, MapPin, Clock } from 'lucide-react';

interface SidebarProps {
  styles: any;
}

export const Sidebar: React.FC<SidebarProps> = ({ styles }) => {
  return (
    <aside style={styles.complementarySidebar} role="complementary" aria-label="Informações Adicionais">
      <div style={styles.sidebarWidget}>
        <h2 style={styles.sidebarWidgetTitle}>Fale Conosco</h2>
        <div style={styles.contactInfo}>
          <div style={styles.contactItem}>
            <Phone size={18} style={styles.contactItemSvg} aria-hidden="true" />
            <div>
              <p style={styles.contactItemTitle}>(21) 97128-2945</p>
              <p style={{ fontSize: '0.8rem' }}>Telefone & WhatsApp</p>
            </div>
          </div>
          <div style={styles.contactItem}>
            <Phone size={18} style={{ ...styles.contactItemSvg, color: '#25D366' }} aria-hidden="true" />
            <div>
              <p style={styles.contactItemTitle}>
                <a 
                  href="https://wa.me/message/CXKB76GBATVRA1" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ color: 'inherit', textDecoration: 'none' }}
                  aria-label="Falar no WhatsApp"
                >
                  Enviar Mensagem
                </a>
              </p>
              <p style={{ fontSize: '0.8rem' }}>Atendimento Rápido</p>
            </div>
          </div>
          <div style={styles.contactItem}>
            <MapPin size={18} style={styles.contactItemSvg} aria-hidden="true" />
            <div>
              <p style={styles.contactItemTitle}>Rua Dr. Ibraim Hannas, 406</p>
              <p style={{ fontSize: '0.8rem' }}>Campo Grande, Rio de Janeiro - RJ</p>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.sidebarWidget}>
        <h2 style={styles.sidebarWidgetTitle}>Horário de Funcionamento</h2>
        <ul style={styles.hoursList}>
          <li style={styles.hoursListItem}>
            <span style={styles.hoursListItemLabel}>Segunda a Sábado</span>
            <strong style={styles.hoursListItemValue}>08:00 - 19:30</strong>
          </li>
          <li style={styles.hoursListItem}>
            <span style={styles.hoursListItemLabel}>Domingos</span>
            <strong style={styles.hoursListItemValue}>Fechado</strong>
          </li>
          <li style={{ border: 'none', marginTop: '10px' }}>
            <span style={styles.hoursListSpecial}>
              <Clock size={16} aria-hidden="true" /> Suporte e Delivery na Região
            </span>
          </li>
        </ul>
      </div>
    </aside>
  );
};
