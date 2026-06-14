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
import { Pagamentos } from './components/Pagamentos';
import { UserManagement } from './components/admin/UserManagement';
import { Registros } from './components/admin/Registros';
import { Configuracoes } from './components/admin/Configuracoes';
import { VendaAvulsa } from './components/VendaAvulsa';
import { Delivery } from './components/Delivery';
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
  const userRole = user?.profile?.role;
  const userSpecialty = (user?.profile as any)?.collaborator_category?.name as string | undefined;
  const isManager = userRole ? roleHierarchy[userRole] >= roleHierarchy['manager'] : false;
  const isOwnerOrDev = userRole === 'developer' || userRole === 'owner';

  const [highContrast, setHighContrast] = useState<boolean>(() => {
    return localStorage.getItem('laviola_high_contrast') === 'true';
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    return Number(localStorage.getItem('laviola_font_size')) || 16;
  });

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
  }, [styles.bodyStyle]);

  useEffect(() => {
    const isPrivate = ['venda-avulsa', 'pets', 'agendamentos', 'financeiro', 'estoque', 'prontuario', 'relatorios', 'pagamentos', 'usuarios', 'registros', 'configuracoes', 'delivery'].includes(activeSection);
    const requiresMgmt = ['usuarios', 'registros'].includes(activeSection);
    const requiresOwnerDev = ['configuracoes'].includes(activeSection);
    const requiresStock = activeSection === 'estoque';
    const isStockAllowed = userRole === 'developer' || userRole === 'owner' || userRole === 'manager' || userSpecialty === 'Estoquista';

    if (isPrivate && !user) {
      setActiveSection('inicio');
    } else if (requiresMgmt && user && !isManager) {
      setActiveSection('inicio');
    } else if (requiresOwnerDev && user && !isOwnerOrDev) {
      setActiveSection('inicio');
    } else if (requiresStock && user && !isStockAllowed) {
      setActiveSection('inicio');
    }
  }, [user, activeSection, isManager, isOwnerOrDev, userRole, userSpecialty]);

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
          windowWidth={windowWidth}
        />

        <div style={styles.layoutGrid}>
          <Navigation
            styles={styles}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            isLoggedIn={!!user}
            userRole={userRole}
            userSpecialty={userSpecialty}
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

            {activeSection === 'venda-avulsa' && user && (
              <VendaAvulsa styles={styles} currentUser={user} />
            )}

            {activeSection === 'pets' && user && (
              <PetCrud userId={user.id} styles={styles} />
            )}

            {activeSection === 'agendamentos' && user && (
              <Agendamentos styles={styles} currentUser={user} setActiveSection={setActiveSection} />
            )}

            {activeSection === 'delivery' && user && (
              <Delivery styles={styles} currentUser={user} />
            )}

            {activeSection === 'pagamentos' && user && userRole === 'client' && (
              <Pagamentos styles={styles} currentUser={user} />
            )}

            {activeSection === 'financeiro' && user && isManager && (
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

            {activeSection === 'registros' && user && isManager && (
              <Registros styles={styles} />
            )}

            {activeSection === 'configuracoes' && user && isOwnerOrDev && (
              <Configuracoes
                styles={styles}
                highContrast={highContrast}
                setHighContrast={(val) => {
                  setHighContrast(val);
                  localStorage.setItem('laviola_high_contrast', String(val));
                }}
                fontSize={fontSize}
                setFontSize={(val) => {
                  setFontSize(val);
                  localStorage.setItem('laviola_font_size', String(val));
                }}
              />
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
