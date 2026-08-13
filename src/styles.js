export const getStyles = (highContrast, fontSize, isDesktop, windowWidth) => {
  const primary = highContrast ? '#ffff00' : 'hsl(210, 85%, 45%)';
  const primaryHover = highContrast ? '#ffffff' : 'hsl(210, 85%, 35%)';
  const secondary = highContrast ? '#00ffff' : 'hsl(36, 95%, 55%)';
  const background = highContrast ? '#000000' : 'hsl(210, 30%, 98%)';
  const cardBg = highContrast ? '#121212' : '#ffffff';
  const textMain = highContrast ? '#ffffff' : 'hsl(210, 25%, 20%)';
  const textMuted = highContrast ? '#dddddd' : 'hsl(210, 15%, 45%)';
  const borderColor = highContrast ? '#ffffff' : 'hsl(210, 20%, 90%)';
  const shadow = highContrast ? 'none' : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';
  const shadowLg = highContrast ? 'none' : '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)';

  const headerIsRow = windowWidth >= 768;
  const articlesIsGrid = windowWidth >= 768;

  return {
    bodyStyle: {
      backgroundColor: background,
      color: textMain,
      fontSize: `${fontSize}px`,
      fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
      lineHeight: 1.6,
      transition: 'background-color 0.3s ease, color 0.3s ease',
      minHeight: '100vh',
      margin: 0,
      padding: 0,
      boxSizing: 'border-box'
    },
    skipLink: (isFocused) => ({
      position: 'absolute',
      top: isFocused ? '20px' : '-100px',
      left: '20px',
      backgroundColor: secondary,
      color: '#000',
      padding: '12px 24px',
      zIndex: 100,
      fontWeight: 600,
      borderRadius: '8px',
      textDecoration: 'none',
      boxShadow: shadowLg,
      transition: 'top 0.2s ease',
      outline: isFocused ? (highContrast ? '3px dashed #ffff00' : '3px solid hsl(210, 85%, 65%)') : 'none'
    }),
    appContainer: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '1600px',
      margin: '0 auto',
      width: '100%',
      padding: windowWidth < 768 ? '0 10px' : windowWidth < 1200 ? '0 28px' : '0 48px',
      boxSizing: 'border-box',
    },
    layoutGrid: {
      display: 'grid',
      gridTemplateColumns: windowWidth >= 1200 ? '264px 1fr 280px'
        : windowWidth >= 768 ? '200px 1fr'
        : '1fr',
      gap: windowWidth < 768 ? '12px' : '24px',
      margin: windowWidth < 768 ? '12px 0' : '24px 0',
      flexGrow: 1,
      minWidth: 0,
    },
    siteHeader: {
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: windowWidth < 768 ? '12px 0' : '24px 0',
      borderBottom: `2px solid ${borderColor}`,
      gap: '8px',
      flexWrap: 'nowrap',
      position: 'relative',
      overflow: 'hidden',
      minWidth: 0,
    },
    siteLogo: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexShrink: 0,
      minWidth: 0,
      overflow: 'hidden',
    },
    logoSvg: {
      color: primary,
      width: windowWidth < 480 ? '28px' : windowWidth < 768 ? '32px' : '44px',
      height: windowWidth < 480 ? '28px' : windowWidth < 768 ? '32px' : '44px',
      flexShrink: 0,
    },
    logoTitle: {
      fontSize: windowWidth < 480 ? '1.1rem' : windowWidth < 768 ? '1.3rem' : '1.8rem',
      fontWeight: 800,
      color: primary,
      letterSpacing: '-0.5px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    accessibilityControls: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    btnAcc: (isHovered) => ({
      backgroundColor: isHovered ? primary : cardBg,
      border: `1px solid ${isHovered ? primary : borderColor}`,
      color: isHovered ? (highContrast ? '#000000' : '#ffffff') : textMain,
      padding: '8px 12px',
      borderRadius: '8px',
      fontFamily: "'Outfit', sans-serif",
      fontWeight: 500,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      boxShadow: shadow,
      transition: 'all 0.3s ease',
      outline: 'none'
    }),
    siteNavigation: {
      backgroundColor: highContrast ? '#000000' : primary,
      borderRadius: '12px',
      padding: '12px',
      boxShadow: shadow,
      height: 'fit-content',
      alignSelf: 'start',
      border: highContrast ? '2px solid #ffffff' : 'none'
    },
    navList: {
      display: 'flex',
      flexDirection: isDesktop ? 'column' : 'row',
      listStyle: 'none',
      flexWrap: 'wrap',
      gap: isDesktop ? '12px' : '8px',
      padding: 0,
      margin: 0
    },
    navLink: (isActive, isHovered) => ({
      color: (highContrast && isHovered) ? '#000000' : '#ffffff',
      textDecoration: 'none',
      padding: '10px 18px',
      borderRadius: '8px',
      fontWeight: 600,
      display: 'block',
      transition: 'all 0.3s ease',
      width: '100%',
      backgroundColor: (highContrast && isHovered)
        ? '#ffff00'
        : isActive 
          ? 'rgba(255, 255, 255, 0.3)' 
          : isHovered 
            ? 'rgba(255, 255, 255, 0.1)' 
            : 'transparent',
      transform: isActive 
        ? (isDesktop ? 'translateX(8px) scale(1.02)' : 'translateY(-2px) scale(1.02)') 
        : isHovered 
          ? (isDesktop ? 'translateX(4px)' : 'translateY(-1px)') 
          : 'none',
      boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
      fontWeight: isActive ? 800 : 600,
      borderLeft: isActive && isDesktop ? '4px solid #ffffff' : '4px solid transparent'
    }),
    mainContent: {
      display: 'flex',
      flexDirection: 'column',
      gap: windowWidth < 768 ? '16px' : '40px',
      minWidth: 0,
    },
    contentSection: {
      backgroundColor: cardBg,
      padding: windowWidth < 768 ? '16px 14px' : '30px',
      borderRadius: '12px',
      border: `1px solid ${borderColor}`,
      boxShadow: shadow,
      overflowX: 'hidden',
    },
    sectionTitle: {
      fontSize: windowWidth < 768 ? '1.25rem' : '1.6rem',
      fontWeight: 700,
      color: primary,
      position: 'relative',
      marginBottom: '16px'
    },
    sectionTitleBar: {
      width: '50px',
      height: '4px',
      backgroundColor: secondary,
      borderRadius: '2px',
      marginTop: '8px'
    },
    articlesGrid: {
      display: 'grid',
      gridTemplateColumns: articlesIsGrid ? 'repeat(2, 1fr)' : '1fr',
      gap: '20px',
      marginTop: '20px'
    },
    serviceCard: (isHovered, customLeftBorder = false) => ({
      backgroundColor: background,
      border: `1px solid ${isHovered ? primary : borderColor}`,
      borderLeft: customLeftBorder ? `4px solid ${secondary}` : `1px solid ${isHovered ? primary : borderColor}`,
      borderRadius: '12px',
      padding: '24px',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transform: isHovered ? 'translateY(-4px)' : 'none',
      boxShadow: isHovered ? shadowLg : 'none'
    }),
    cardIcon: {
      backgroundColor: highContrast ? 'transparent' : 'rgba(210, 85%, 45%, 0.1)',
      color: primary,
      width: '48px',
      height: '48px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      fontSize: '1.5rem',
      border: highContrast ? '1px solid #ffffff' : 'none'
    },
    serviceCardTitle: {
      fontSize: '1.25rem',
      fontWeight: 700,
      color: textMain
    },
    serviceCardText: {
      color: textMuted,
      fontSize: '0.95rem',
      flexGrow: 1
    },
    btnMore: (isHovered) => ({
      alignSelf: 'flex-start',
      color: isHovered ? primaryHover : primary,
      textDecoration: isHovered ? 'underline' : 'none',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '0.9rem',
      transition: 'all 0.3s ease'
    }),
    complementarySidebar: {
      display: windowWidth >= 1200 ? 'flex' : 'none',
      flexDirection: 'column',
      gap: '24px',
      minWidth: 0,
    },
    sidebarWidget: {
      backgroundColor: cardBg,
      padding: '24px',
      borderRadius: '12px',
      border: `1px solid ${borderColor}`,
      boxShadow: shadow
    },
    sidebarWidgetTitle: {
      fontSize: '1.25rem',
      color: primary,
      marginBottom: '16px',
      borderBottom: `2px solid ${borderColor}`,
      paddingBottom: '8px'
    },
    sidebarWidgetText: {
      color: textMuted,
      fontSize: '0.95rem',
      marginBottom: '12px'
    },
    contactInfo: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    },
    contactItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '0.95rem'
    },
    contactItemSvg: {
      color: secondary,
      flexShrink: 0
    },
    contactItemTitle: {
      fontWeight: 600,
      color: textMain
    },
    hoursList: {
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontSize: '0.9rem',
      padding: 0,
      margin: 0
    },
    hoursListItem: {
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: `1px dashed ${borderColor}`,
      paddingBottom: '4px'
    },
    hoursListItemLabel: {
      color: textMuted
    },
    hoursListItemValue: {
      color: textMain
    },
    hoursListSpecial: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      color: secondary,
      fontWeight: 600
    },
    siteFooter: {
      backgroundColor: cardBg,
      borderTop: `2px solid ${borderColor}`,
      padding: '40px 0 20px',
      marginTop: 'auto'
    },
    footerContent: {
      display: 'grid',
      gridTemplateColumns: windowWidth >= 768 ? '2fr 1fr' : '1fr',
      gap: '30px',
      marginBottom: '30px'
    },
    footerAboutTitle: {
      fontSize: '1.4rem',
      color: primary,
      marginBottom: '12px'
    },
    footerAboutText: {
      color: textMuted,
      fontSize: '0.95rem',
      maxWidth: '600px'
    },
    footerLinks: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    },
    footerLinksTitle: {
      fontSize: '1.1rem',
      color: textMain
    },
    footerLinksList: {
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: 0,
      margin: 0
    },
    footerLinksItemLink: (isHovered) => ({
      color: isHovered ? primary : textMuted,
      textDecoration: isHovered ? 'underline' : 'none',
      fontSize: '0.9rem',
      transition: 'all 0.3s ease'
    }),
    footerBottom: {
      borderTop: `1px solid ${borderColor}`,
      paddingTop: '20px',
      display: 'flex',
      flexDirection: windowWidth >= 768 ? 'row' : 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '15px',
      fontSize: '0.85rem',
      color: textMuted
    },
    instagramPromoWidget: {
      marginTop: '30px',
      padding: '20px',
      backgroundColor: highContrast ? 'transparent' : 'rgba(210, 85%, 45%, 0.05)',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      border: `1px solid ${borderColor}`
    },
    authContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: windowWidth < 480 ? '6px' : '10px',
      flexShrink: 0,
      minWidth: 0,
    },
    userInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      minWidth: 0,
      overflow: 'hidden',
    },
    userName: {
      fontWeight: 600,
      color: textMain,
      fontSize: '0.85rem',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      // hidden on mobile via Header component directly
    },
    userAvatar: {
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      backgroundColor: highContrast ? 'transparent' : 'rgba(210, 85%, 45%, 0.1)',
      border: `1px solid ${borderColor}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: primary,
      flexShrink: 0,
    },
    btnLogout: (isHovered) => ({
      backgroundColor: isHovered ? 'hsl(0, 75%, 50%)' : 'transparent',
      border: `1px solid ${isHovered ? 'hsl(0, 75%, 50%)' : 'hsl(0, 75%, 60%)'}`,
      color: isHovered ? '#ffffff' : 'hsl(0, 75%, 60%)',
      padding: windowWidth < 480 ? '5px 8px' : '7px 14px',
      borderRadius: '8px',
      fontFamily: "'Outfit', sans-serif",
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      transition: 'all 0.3s ease',
      fontSize: windowWidth < 480 ? '0.78rem' : '0.9rem',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }),
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    },
    modalContent: {
      backgroundColor: cardBg,
      border: `1px solid ${borderColor}`,
      borderRadius: '16px',
      padding: '30px',
      width: '100%',
      maxWidth: '400px',
      maxHeight: '90vh',
      overflowY: 'auto',
      boxShadow: shadowLg,
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      position: 'relative'
    },
    modalHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    modalTitle: {
      fontSize: '1.4rem',
      fontWeight: 700,
      color: primary,
      margin: 0
    },
    modalCloseBtn: (isHovered) => ({
      background: 'none',
      border: 'none',
      color: isHovered ? primary : textMuted,
      cursor: 'pointer',
      padding: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'color 0.2s ease'
    }),
    modalForm: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    },
    formLabel: {
      fontSize: '0.9rem',
      fontWeight: 600,
      color: textMain
    },
    formInput: {
      padding: '10px 14px',
      borderRadius: '8px',
      border: `1px solid ${borderColor}`,
      backgroundColor: background,
      color: textMain,
      fontFamily: "'Outfit', sans-serif",
      fontSize: '0.95rem',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.3s ease'
    },
    formSubmitBtn: (isHovered) => ({
      backgroundColor: isHovered ? primaryHover : primary,
      border: 'none',
      color: '#ffffff',
      padding: '12px',
      borderRadius: '8px',
      fontFamily: "'Outfit', sans-serif",
      fontWeight: 600,
      fontSize: '1rem',
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      marginTop: '10px'
    }),
    modalSwitchText: {
      fontSize: '0.85rem',
      color: textMuted,
      textAlign: 'center',
      marginTop: '10px'
    },
    modalSwitchBtn: {
      background: 'none',
      border: 'none',
      color: primary,
      fontWeight: 600,
      cursor: 'pointer',
      padding: '0 4px',
      textDecoration: 'underline'
    },
    crudContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    },
    crudHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '15px'
    },
    crudList: {
      display: 'grid',
      gridTemplateColumns: windowWidth >= 768 ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr',
      gap: '20px'
    },
    petCard: {
      backgroundColor: cardBg,
      border: `1px solid ${borderColor}`,
      borderRadius: '12px',
      padding: '20px',
      boxShadow: shadow,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    },
    petHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    petName: {
      fontSize: '1.2rem',
      fontWeight: 700,
      color: primary,
      margin: 0
    },
    petBadge: {
      fontSize: '0.75rem',
      fontWeight: 600,
      padding: '4px 8px',
      borderRadius: '20px',
      backgroundColor: highContrast ? 'transparent' : 'rgba(36, 95%, 55%, 0.1)',
      color: secondary,
      border: `1px solid ${borderColor}`
    },
    petDetail: {
      fontSize: '0.9rem',
      color: textMuted,
      display: 'flex',
      justifyContent: 'space-between'
    },
    petActions: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '10px',
      borderTop: `1px solid ${borderColor}`,
      paddingTop: '12px'
    },
    btnIcon: (isHovered, isDanger = false) => ({
      background: 'none',
      border: 'none',
      color: isHovered 
        ? (isDanger ? 'hsl(0, 75%, 50%)' : primary) 
        : textMuted,
      cursor: 'pointer',
      padding: '6px',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      backgroundColor: isHovered 
        ? (highContrast ? 'transparent' : (isDanger ? 'rgba(255, 0, 0, 0.05)' : 'rgba(210, 85%, 45%, 0.05)')) 
        : 'transparent',
      ...(highContrast && isHovered && {
        border: `1px solid ${isDanger ? 'red' : 'yellow'}`
      })
    })
  };
};
