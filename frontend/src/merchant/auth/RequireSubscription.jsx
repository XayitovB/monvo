import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const FREE_PATHS = ['/billing', '/settings'];

export default function RequireSubscription({ children }) {
  const { hasSubscription, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  const isFree = FREE_PATHS.some(p => location.pathname.startsWith(p));
  if (isFree) return children;

  if (!hasSubscription) {
    return <Navigate to="/billing" replace state={{ from: location }}/>;
  }

  return children;
}
