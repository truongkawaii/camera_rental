import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const rawUrl = import.meta.env.VITE_API_URL || '';
const cleanUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;

const API_BASE = import.meta.env.DEV
  ? '/api'
  : (cleanUrl ? `${cleanUrl}/api` : '/api');

export const AuthProvider = ({ children }) => {
  const [user, setUser]     = useState(null);
  const [token, setToken]   = useState(() => localStorage.getItem('token'));
  const [activeRole, setActiveRole] = useState(() => localStorage.getItem('activeRole'));
  const [loading, setLoading] = useState(true);

  // Attach token to every axios request
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Attach activeRole to every axios request
  useEffect(() => {
    if (activeRole) {
      axios.defaults.headers.common['X-Active-Role'] = activeRole;
    } else {
      delete axios.defaults.headers.common['X-Active-Role'];
    }
  }, [activeRole]);

  // Verify token on mount
  useEffect(() => {
    const verify = async () => {
      if (!token) { setLoading(false); return; }
      try {
        const res = await axios.get(`${API_BASE}/auth/me`);
        const u = res.data.user;
        setUser(u);
        
        // Restore activeRole or set default
        let storedRole = localStorage.getItem('activeRole');
        if (storedRole && ((Array.isArray(u.roles) && u.roles.includes(storedRole)) || u.role === storedRole)) {
          setActiveRole(storedRole);
        } else {
          let defaultRole = null;
          if (Array.isArray(u.roles) && u.roles.length > 0) {
            defaultRole = u.roles[0];
          } else if (typeof u.role === 'string') {
            defaultRole = u.role;
          }
          if (defaultRole) {
            setActiveRole(defaultRole);
            localStorage.setItem('activeRole', defaultRole);
          }
        }
      } catch {
        // Token invalid / expired — clear it
        localStorage.removeItem('token');
        localStorage.removeItem('activeRole');
        setToken(null);
        setUser(null);
        setActiveRole(null);
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, []);

  const login = async (username, password) => {
    const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('token', t);
    setToken(t);
    setUser(u);
    
    let defaultRole = null;
    if (Array.isArray(u.roles) && u.roles.length > 0) {
      defaultRole = u.roles[0];
    } else if (typeof u.role === 'string') {
      defaultRole = u.role;
    }
    if (defaultRole) {
      setActiveRole(defaultRole);
      localStorage.setItem('activeRole', defaultRole);
    }

    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    return u;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeRole');
    setToken(null);
    setUser(null);
    setActiveRole(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const switchRole = (newRole) => {
    if (newRole === activeRole) return;
    if (user && ((Array.isArray(user.roles) && user.roles.includes(newRole)) || user.role === newRole)) {
      setActiveRole(newRole);
      localStorage.setItem('activeRole', newRole);
    }
  };

  /**
   * Check if user has a specific role.
   * If activeRole is set, check against activeRole.
   * Otherwise supports new format (roles: []) and legacy format (role: string).
   */
  const hasRole = (...roles) => {
    if (!user) return false;
    if (activeRole) {
      return roles.includes(activeRole);
    }
    if (Array.isArray(user.roles)) {
      return roles.some(r => user.roles.includes(r));
    }
    // Legacy fallback
    if (typeof user.role === 'string') {
      return roles.includes(user.role);
    }
    return false;
  };

  const isAdmin         = hasRole('admin');
  const isSaler         = hasRole('saler');
  const isCameraManager = hasRole('camera_manager');
  const isInvestor      = hasRole('investor');
  const isDriver        = hasRole('driver');

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin, isSaler, isCameraManager, isInvestor, isDriver, hasRole, activeRole, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
