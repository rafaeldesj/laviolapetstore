import React, { useState } from 'react';
import { Send, CheckCircle } from 'lucide-react';

interface ContactFormProps {
  styles: any;
}

export const ContactForm: React.FC<ContactFormProps> = ({ styles }) => {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hoveredSubmit, setHoveredSubmit] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.email && formData.message) {
      setIsSubmitted(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: `1px solid ${styles.sidebarWidgetTitle.borderBottom.split(' ')[2]}`,
    backgroundColor: styles.bodyStyle.backgroundColor,
    color: styles.bodyStyle.color,
    fontSize: '0.95rem',
    marginTop: '6px',
    fontFamily: 'inherit',
    outline: 'none'
  };

  return (
    <section style={styles.contentSection} id="contato">
      <h2 style={styles.sectionTitle}>
        Fale Conosco
        <div style={styles.sectionTitleBar}></div>
      </h2>
      
      {isSubmitted ? (
        <div style={{
          padding: '30px',
          textAlign: 'center',
          backgroundColor: 'rgba(37, 211, 102, 0.1)',
          borderRadius: '12px',
          border: '1px solid #25D366',
          color: styles.bodyStyle.color,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '15px'
        }}>
          <CheckCircle size={48} style={{ color: '#25D366' }} />
          <h3 style={{ fontWeight: 700 }}>Mensagem Enviada!</h3>
          <p style={styles.sidebarWidgetText}>
            Obrigado pelo contato, {formData.name}. Nossa equipe responderá sua mensagem por e-mail em até 24 horas úteis.
          </p>
          <button 
            onClick={() => {
              setIsSubmitted(false);
              setFormData({ name: '', email: '', message: '' });
            }}
            style={{
              backgroundColor: styles.logoSvg.color,
              color: '#ffffff',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            Nova Mensagem
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
          <div>
            <label htmlFor="name" style={{ fontWeight: 600, color: styles.bodyStyle.color }}>Nome Completo</label>
            <input 
              type="text" 
              id="name" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              required 
              style={inputStyle}
              placeholder="Digite seu nome"
            />
          </div>
          <div>
            <label htmlFor="email" style={{ fontWeight: 600, color: styles.bodyStyle.color }}>E-mail para Contato</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              value={formData.email} 
              onChange={handleChange} 
              required 
              style={inputStyle}
              placeholder="exemplo@email.com"
            />
          </div>
          <div>
            <label htmlFor="message" style={{ fontWeight: 600, color: styles.bodyStyle.color }}>Sua Mensagem</label>
            <textarea 
              id="message" 
              name="message" 
              value={formData.message} 
              onChange={handleChange} 
              required 
              style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
              placeholder="Como podemos ajudar você e seu pet?"
            />
          </div>

          <button 
            type="submit"
            style={{
              alignSelf: 'flex-start',
              backgroundColor: hoveredSubmit ? styles.btnMore(true).color : styles.logoSvg.color,
              color: '#ffffff',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={() => setHoveredSubmit(true)}
            onMouseLeave={() => setHoveredSubmit(false)}
          >
            <Send size={16} /> Enviar Mensagem
          </button>
        </form>
      )}
    </section>
  );
};
