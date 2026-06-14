import { Component } from 'react'
import { Box, Paper, Typography, Button } from '@mui/material'

// Catches render/runtime errors anywhere below it and shows a readable message
// instead of a blank screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('App crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
        <Paper sx={{ p: 4, maxWidth: 520 }}>
          <Typography variant="h5" sx={{ color: '#ef5350', mb: 1 }}>Something went wrong</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: '#cdbf94' }}>
            The app hit an unexpected error and stopped. The details are below and in the console.
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'rgba(0,0,0,0.3)', overflow: 'auto', maxHeight: 200 }}>
            <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', m: 0 }}>
              {String(this.state.error?.stack || this.state.error)}
            </Typography>
          </Paper>
          <Button variant="contained" onClick={() => window.location.reload()}>Reload</Button>
        </Paper>
      </Box>
    )
  }
}
