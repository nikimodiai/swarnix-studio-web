import React from 'react';

// Top-level safety net: without this, any uncaught render error unmounts the
// whole app to a blank white screen with no way for the user to recover.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: 24,
          textAlign: 'center', fontFamily: 'sans-serif', gap: 12,
        }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666', maxWidth: 420 }}>
            Please reload the page and try again. If this keeps happening, try a different photo.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#111', color: '#fff', cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
