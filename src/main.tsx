import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FlowluTasksEntry } from './components/FlowluTasksEntry';
import './styles.css';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {pathname === '/tasks' ? <FlowluTasksEntry /> : <App />}
  </React.StrictMode>
);
