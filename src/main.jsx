import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/inter';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/theme.scss';
import App from './App';
import { AuthProvider } from './hooks/AuthContext';
import { ToastProvider } from './components/ui';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
