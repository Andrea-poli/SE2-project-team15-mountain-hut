// Logged-in user for the whole app. Mounted once in main.jsx, read with useAuth() (useAuth.js).
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.js';
import { AuthContext } from './useAuth.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Error of the startup check (server down...), for the layout to show.
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false; // StrictMode runs the effect twice: keep only the last answer
    authApi
      .me()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch((err) => {
        if (cancelled) return;
        setUser(null);
        // 401 = nobody logged in: a normal state, not an error.
        if (err.status !== 401) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Errors are thrown to the caller (the form shows them); the startup error is cleared on success.
  const login = useCallback(async (email, password) => {
    const loggedIn = await authApi.login(email, password);
    setUser(loggedIn);
    setError(null);
    return loggedIn;
  }, []);

  const register = useCallback(async (data) => {
    const created = await authApi.register(data);
    setUser(created);
    setError(null);
    return created;
  }, []);

  // Logout is started from the navbar, which has no place for messages: the error goes to `error`
  // (shown by PageLayout) and is thrown again for the caller.
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      setError(err.message);
      throw err;
    }
    setUser(null);
    setError(null);
  }, []);

  // MH-07: after the change the server returns the user with mustChangePassword false (the guard lets go).
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const updated = await authApi.changePassword(currentPassword, newPassword);
    setUser(updated);
    return updated;
  }, []);

  // MH-07: a password reset ends every session of the link's user on the server. This browser may hold that
  // user, someone else (e.g. staff on the hut PC opening a hiker's link) or nobody: ask the server who is
  // logged in now, so the screen matches it. Never throws: the password is already changed at this point.
  const refreshUser = useCallback(async () => {
    try {
      setUser(await authApi.me());
    } catch (err) {
      if (err.status === 401) setUser(null);
      else setError(err.message); // server unreachable: keep what we had, show why
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, login, register, logout, changePassword, refreshUser }),
    [user, loading, error, login, register, logout, changePassword, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
