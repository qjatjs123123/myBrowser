import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { Toaster } from './lib/toast';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root 요소가 없습니다');

createRoot(rootElement).render(
  <StrictMode>
    <App />
    <Toaster position="bottom-left" richColors closeButton />
  </StrictMode>,
);
