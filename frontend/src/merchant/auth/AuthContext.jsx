import React, { createContext, useContext, useEffect, useState } from 'react';
import api, { auth } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tariff, setTariff] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!auth.isAuthed) {
      setUser(null);
      setTariff(null);
      setLoading(false);
      return;
    }
    try {
      const [me, tf] = await Promise.all([
        api.me(),
        api.myTariff().catch(() => null),
      ]);
      setUser(me);
      setTariff(tf);
    } catch {
      auth.clear();
      setUser(null);
      setTariff(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const login = async ({ email, password }) => {
    const result = await api.loginWithEmail({ email, password });
    if (result?.kind !== 'admin') {
      await refresh();
    }
    return result;
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setTariff(null);
  };

  // true if merchant has an active (non-expired) tariff assigned
  const hasSubscription = !!(tariff?.tariff && !tariff?.expired);

  // Tarif funksiyalari va limitlari (backend /merchants/me/tariff dan)
  const features = tariff?.tariff?.features || {};
  const limits = tariff?.tariff?.limits || {};
  const tariffExpired = !!tariff?.expired;

  // Funksiya tarifda yoqilgan-mi (faol obuna + bayroq true)
  const hasFeature = (key) => hasSubscription && !!features[key];

  return (
    <AuthContext.Provider value={{
      user, tariff, loading, login, logout, refresh,
      isAuthed: !!user, hasSubscription,
      features, limits, tariffExpired, hasFeature,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>');
  return ctx;
}
