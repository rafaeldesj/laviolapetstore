import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { HomeWelcome } from './components/HomeWelcome';
import { Services } from './components/Services';
import { Promotions } from './components/Promotions';
import { ContactForm } from './components/ContactForm';
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { getStyles } from './styles';

function App() {
  const [fontSize, setFontSize] = useState<number>(16);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const [isSkipFocused, setIsSkipFocused] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>('inicio');

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const styles = getStyles(highContrast, fontSize, windowWidth >= 992, windowWidth);

  useEffect(() => {
    const body = document.body;
    Object.keys(styles.bodyStyle).forEach((key) => {
      (body.style as any)[key] = (styles.bodyStyle as any)[key];
    });
  }, [highContrast, fontSize, windowWidth]);

  return (
    <>
      <a 
        href="#main-content" 
        style={styles.skipLink(isSkipFocused)}
        onFocus={() => setIsSkipFocused(true)}
        onBlur={() => setIsSkipFocused(false)}
      >
        Pular para o conteúdo principal
      </a>

      <div style={styles.appContainer}>
        <Header 
          fontSize={fontSize} 
          setFontSize={setFontSize} 
          highContrast={highContrast} 
          setHighContrast={setHighContrast} 
          styles={styles}
        />

        <div style={styles.layoutGrid}>
          <Navigation 
            styles={styles} 
            activeSection={activeSection} 
            setActiveSection={setActiveSection} 
          />

          <main id="main-content" style={styles.mainContent} role="main">
            {activeSection === 'inicio' && (
              <HomeWelcome styles={styles} setActiveSection={setActiveSection} />
            )}

            {activeSection === 'servicos' && (
              <Services styles={styles} />
            )}

            {activeSection === 'promocoes' && (
              <Promotions styles={styles} />
            )}
            
            {activeSection === 'sobre' && (
              <section style={styles.contentSection} id="sobre" aria-labelledby="about-heading">
                <h2 id="about-heading" style={styles.sectionTitle}>
                  Quem Somos
                  <div style={styles.sectionTitleBar}></div>
                </h2>
                <p style={{ marginTop: '15px', color: styles.sidebarWidgetText.color }}>
                  No La Viola Petshop, somos movidos pelo amor incondicional aos animais. Fundado por veterinários experientes, nosso espaço foi planejado do zero para garantir que cada cão, gato ou animal de estimação se sinta seguro e confortável durante todo o atendimento.
                </p>
                <p style={{ marginTop: '15px', color: styles.sidebarWidgetText.color }}>
                  Valorizamos a transparência e a acessibilidade, oferecendo preços justos, atendimento inclusivo e instalações adaptadas. Venha nos visitar e conheça a nossa equipe de especialistas certificados.
                </p>
              </section>
            )}

            {activeSection === 'contato' && (
              <ContactForm styles={styles} />
            )}
          </main>

          <Sidebar styles={styles} />
        </div>

        <Footer styles={styles} />
      </div>
    </>
  );
}

export default App;
