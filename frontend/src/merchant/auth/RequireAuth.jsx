import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RequireAuth({ children }) {
  const { isAuthed, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--m-bg, #F7F6F2)', color: 'var(--m-ink-mute, #6B7280)',
        fontSize: 13, fontFamily: 'system-ui',
      }}>
        Загружаем…
      </div>
    );
  }
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: location }}/>;
  return children;
}
