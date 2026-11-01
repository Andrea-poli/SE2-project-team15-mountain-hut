import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Order matters: the theme overrides Bootstrap.
import 'bootstrap/dist/css/bootstrap.min.css';
import './theme.css';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';

// Providers live here, so App.jsx holds only the router and tests can wrap it as they need.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
