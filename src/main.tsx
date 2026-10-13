import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CrmEntry } from './components/CrmEntry';
import { FlowluTasksEntry } from './components/FlowluTasksEntry';
import './styles.css';
import './components/CrmOpportunityBoardRefine.css';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {pathname === '/tasks' ? <FlowluTasksEntry /> : pathname === '/crm' ? <CrmEntry /> : <App />}
  </React.StrictMode>
);
