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
      maxWidth: '1400px',
      margin: '0 auto',
      padding: '0 20px',
      width: '100%'
    },
    layoutGrid: {
      display: 'grid',
      gridTemplateColumns: isDesktop ? '240px 1fr 300px' : '1fr',
      gap: '30px',
      margin: '30px 0',
      flexGrow: 1
    },
    siteHeader: {
      display: 'flex',
      flexDirection: headerIsRow ? 'row' : 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '24px 0',
      borderBottom: `2px solid ${borderColor}`,
      gap: '20px'
    },
    siteLogo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    logoSvg: {
      color: primary,
      width: '44px',
      height: '44px'
    },
    logoTitle: {
      fontSize: '1.8rem',
      fontWeight: 800,
      color: primary,
      letterSpacing: '-0.5px'
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
        : ((isActive || isHovered) ? 'rgba(255, 255, 255, 0.15)' : 'transparent'),
      transform: (isActive || isHovered) ? (isDesktop ? 'translateX(4px)' : 'translateY(-1px)') : 'none'
    }),
    mainContent: {
      display: 'flex',
      flexDirection: 'column',
      gap: '40px'
    },
    contentSection: {
      backgroundColor: cardBg,
      padding: '30px',
      borderRadius: '12px',
      border: `1px solid ${borderColor}`,
      boxShadow: shadow
    },
    sectionTitle: {
      fontSize: '1.6rem',
      fontWeight: 700,
      color: primary,
      position: 'relative',
      marginBottom: '20px'
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
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
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
    }
  };
};
