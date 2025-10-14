import { createTheme } from '@mui/material/styles';

// Official Stellar Brand Colors
const stellarColors = {
  // Primary Stellar Colors
  stellarYellow: '#FFD700',
  stellarGold: '#FFA500',
  stellarBlack: '#000000',
  stellarWhite: '#FFFFFF',
  stellarDarkGray: '#1a1a1a',
  stellarLightGray: '#f5f5f5',
  
  // Accent Colors
  stellarBlue: '#007bff',
  stellarGreen: '#28a745',
  stellarRed: '#dc3545',
  stellarOrange: '#fd7e14',
  
  // Text Colors
  textPrimary: '#000000',
  textSecondary: '#666666',
  textOnDark: '#FFFFFF',
  textOnYellow: '#000000',
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: stellarColors.stellarYellow,
      light: '#FFE55C',
      dark: '#E6C200',
      contrastText: stellarColors.stellarBlack,
    },
    secondary: {
      main: stellarColors.stellarGold,
      light: '#FFB84D',
      dark: '#CC8400',
      contrastText: stellarColors.stellarBlack,
    },
    background: {
      default: stellarColors.stellarWhite,
      paper: stellarColors.stellarWhite,
      dark: stellarColors.stellarDarkGray,
    },
    text: {
      primary: stellarColors.textPrimary,
      secondary: stellarColors.textSecondary,
    },
    // Custom Stellar colors
    stellar: {
      yellow: stellarColors.stellarYellow,
      gold: stellarColors.stellarGold,
      black: stellarColors.stellarBlack,
      white: stellarColors.stellarWhite,
      darkGray: stellarColors.stellarDarkGray,
      lightGray: stellarColors.stellarLightGray,
      blue: stellarColors.stellarBlue,
      green: stellarColors.stellarGreen,
      red: stellarColors.stellarRed,
      orange: stellarColors.stellarOrange,
    },
    // Status colors
    success: {
      main: stellarColors.stellarGreen,
      light: '#d4edda',
      dark: '#155724',
    },
    error: {
      main: stellarColors.stellarRed,
      light: '#f8d7da',
      dark: '#721c24',
    },
    warning: {
      main: stellarColors.stellarOrange,
      light: '#fff3cd',
      dark: '#856404',
    },
    info: {
      main: stellarColors.stellarBlue,
      light: '#d1ecf1',
      dark: '#0c5460',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontWeight: 700,
      color: stellarColors.stellarBlack,
    },
    h2: {
      fontWeight: 600,
      color: stellarColors.stellarBlack,
    },
    h3: {
      fontWeight: 600,
      color: stellarColors.stellarBlack,
    },
    h4: {
      fontWeight: 500,
      color: stellarColors.stellarBlack,
    },
    h5: {
      fontWeight: 500,
      color: stellarColors.stellarBlack,
    },
    h6: {
      fontWeight: 500,
      color: stellarColors.stellarBlack,
    },
    body1: {
      color: stellarColors.textPrimary,
    },
    body2: {
      color: stellarColors.textSecondary,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: stellarColors.stellarBlack,
          color: stellarColors.stellarWhite,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
        contained: {
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: `1px solid ${stellarColors.stellarLightGray}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
  },
});

export default theme; 