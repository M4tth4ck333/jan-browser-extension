import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { BrowserThemeSync } from './components/BrowserThemeSync';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserThemeSync>
      <App />
    </BrowserThemeSync>
  </React.StrictMode>,
);
