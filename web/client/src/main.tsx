import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import 'dockview/dist/styles/dockview.css';
import App from './App';
import { AuthProvider } from './app/auth';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ThemeProvider } from './app/theme';
import { ToastProvider } from './app/ui/Toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <ToastProvider>
              <App />
            </ToastProvider>
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
