import React from 'react';
import { createRoot } from 'react-dom/client';
import { bootCachedCustomizationEarly } from '@core/customization/customizationDom.js';
import { App } from './App.jsx';
import './styles/base.css';

// Apply cached theme, typography, and custom CSS before first React paint (zero flash)
bootCachedCustomizationEarly();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
