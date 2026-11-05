// Context object and hook, kept apart from AuthProvider so AuthContext.jsx exports only a component
// (React Fast Refresh, lint rule react-refresh/only-export-components).
import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

// { user, loading, error, login, register, logout }
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider> (see main.jsx)');
  return context;
}
