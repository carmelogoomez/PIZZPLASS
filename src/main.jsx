import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Router } from './site';
import IntroGate from './LogoIntro';

createRoot(document.getElementById('root')).render(<StrictMode>
  <IntroGate><Router /></IntroGate>
</StrictMode>);
