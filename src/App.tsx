import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { HomeWelcome } from './components/HomeWelcome';
import { Services } from './components/Services';
import { Promotions } from './components/Promotions';
import { ContactForm } from './components/ContactForm';
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { LoginModal } from './components/LoginModal';
import { PetCrud } from './components/PetCrud';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getStyles } from './styles';

interface UserSession {
  id: string;
  email: string;
  name: string;
}

function App() {
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const [isSkipFocused, setIsSkipFocused] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>('inicio');
  const [user, setUser] = useState<UserSession | null>(null);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const styles = getStyles(false, 16, windowWidth >= 992, windowWidth);

  useEffect(() => {
    const body = document.body;
    Object.keys(styles.bodyStyle).forEach((key) => {
      (body.style as any)[key] = (styles.bodyStyle as any)[key];
    });
  }, [windowWidth]);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
          });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
          });
        } else {
          setUser(null);
          setActiveSection('inicio');
        }
      });

      return () => subscription.unsubscribe();
    } else {
      const saved = localStorage.getItem('laviola_mock_session');
      if (saved) {
        setUser(JSON.parse(saved));
      }
    }
  }, []);

  const handleLogout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('laviola_mock_session');
      setUser(null);
      setActiveSection('inicio');
    }
  };

  const handleLoginSuccess = (loggedInUser: UserSession) => {
    setUser(loggedInUser);
    if (!isSupabaseConfigured) {
      localStorage.setItem('laviola_mock_session', JSON.stringify(loggedInUser));
    }
  };

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
          user={user}
          onLoginClick={() => setShowLoginModal(true)}
          onLogout={handleLogout}
          styles={styles}
        />

        <div style={styles.layoutGrid}>
          <Navigation 
            styles={styles} 
            activeSection={activeSection} 
            setActiveSection={setActiveSection} 
            isLoggedIn={!!user}
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

            {activeSection === 'pets' && user && (
              <PetCrud userId={user.id} styles={styles} />
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

      {showLoginModal && (
        <LoginModal 
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={handleLoginSuccess}
          styles={styles}
        />
      )}
    </>
  );
}

export default App;

