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
import { RegisterModal } from './components/RegisterModal';
import { PetCrud } from './components/PetCrud';
import { Agendamentos } from './components/Agendamentos';
import { Financeiro } from './components/Financeiro';
import { Estoque } from './components/Estoque';
import { Prontuario } from './components/Prontuario';
import { Relatorios } from './components/Relatorios';
import { UserManagement } from './components/admin/UserManagement';
import { useAuth } from './hooks/useAuth';
import { roleHierarchy } from './supabaseClient';
import { getStyles } from './styles';

type ModalView = 'none' | 'login' | 'register';

function App() {
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const [isSkipFocused, setIsSkipFocused] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>('inicio');
  const [modalView, setModalView] = useState<ModalView>('none');

  const { user, login, logout, setMockUser } = useAuth();

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
    if (!user && (activeSection === 'pets' || activeSection === 'usuarios')) {
      setActiveSection('inicio');
    }
  }, [user, activeSection]);

  const userRole = user?.profile?.role;
  const isManager = userRole ? roleHierarchy[userRole] >= roleHierarchy['manager'] : false;

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
          user={user ? { name: user.name, profile: user.profile } : null}
          onLoginClick={() => setModalView('login')}
          onLogout={async () => { await logout(); setActiveSection('inicio'); }}
          styles={styles}
        />

        <div style={styles.layoutGrid}>
          <Navigation
            styles={styles}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            isLoggedIn={!!user}
            userRole={userRole}
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

            {activeSection === 'agendamentos' && user && (
              <Agendamentos styles={styles} currentUser={user} setActiveSection={setActiveSection} />
            )}

            {activeSection === 'financeiro' && user && (
              <Financeiro styles={styles} />
            )}

            {activeSection === 'estoque' && user && (
              <Estoque styles={styles} />
            )}

            {activeSection === 'prontuario' && user && (
              <Prontuario styles={styles} />
            )}

            {activeSection === 'relatorios' && user && (
              <Relatorios styles={styles} />
            )}

            {activeSection === 'usuarios' && user && isManager && (
              <UserManagement currentUser={user} styles={styles} />
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

      {modalView === 'login' && (
        <LoginModal
          onClose={() => setModalView('none')}
          onLoginSuccess={(u) => { setMockUser(u); setModalView('none'); }}
          onGoRegister={() => setModalView('register')}
          styles={styles}
          login={login}
          user={user}
        />
      )}

      {modalView === 'register' && (
        <RegisterModal
          onClose={() => setModalView('none')}
          onRegisterSuccess={(u) => { setMockUser(u); setModalView('none'); }}
          onGoLogin={() => setModalView('login')}
          styles={styles}
        />
      )}
    </>
  );
}

export default App;
