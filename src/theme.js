import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#e0b343' },
    secondary: { main: '#2f8f5b' },
    background: {
      default: '#0b3d2e',
      paper: '#12352a'
    }
  },
  typography: {
    fontFamily: '"Segoe UI", system-ui, sans-serif'
  },
  shape: { borderRadius: 8 }
})

export default theme
