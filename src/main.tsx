import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import App from './App';
import { startCrossTabSync } from './features/bus/crossTab';

// keep every open tab of the app on this device in step (same-browser only)
startCrossTabSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
