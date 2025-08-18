import React from 'react';
import ReactDOM from 'react-dom/client';
import { IndexComponent } from './routes/index';
import { AdminComponent } from './routes/admin';
import { RoomComponent } from './routes/$roomId';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

// Simple routing function
function getCurrentRoute() {
  const path = window.location.pathname;

  if (path === '/admin') {
    return <AdminComponent />;
  } else if (path === '/') {
    return <IndexComponent />;
  } else {
    // Extract room ID from path
    const roomId = path.slice(1); // Remove leading slash
    return <RoomComponent roomId={roomId} />;
  }
}

// Simple navigation function
function navigate(path: string) {
  window.history.pushState({}, '', path);
  renderApp();
}

// Render function
function renderApp() {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <div id="app">
            {getCurrentRoute()}
          </div>
        </ErrorBoundary>
      </React.StrictMode>
    );
  }
}

// Handle browser back/forward
window.addEventListener('popstate', renderApp);

// Initial render
renderApp();

// Export navigation function for components to use
(window as any).navigate = navigate;
