import type { Usuario, RolUsuario, UserScope } from '@/types';
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: Usuario | null;
  sessionUser: { email?: string } | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isEditor: boolean;
  isViewer: boolean;
  /** True si el usuario tiene scope asignado (no es super_admin sin scope) */
  hasScope: boolean;
  /** El scope del usuario: pais_id, compania_id, organizacion_id */
  userScope: UserScope;
  /** True si el usuario puede editar (super_admin, admin, editor) */
  canEdit: boolean;
  /** True si el usuario puede eliminar (super_admin, admin) */
  canDelete: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [sessionUser, setSessionUser] = useState<{ email?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoading = useCallback(() => {
    setIsLoading(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const fetchUserProfile = useCallback(async (userId: string, email: string) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (data && !error) {
        setUser(data as Usuario);
        return;
      }
      // Create user record if doesn't exist
      const { data: newUser } = await supabase
        .from('usuarios')
        .insert({ id: userId, email, nombre: email.split('@')[0], rol: 'viewer' })
        .select()
        .maybeSingle();
      if (newUser) {
        setUser(newUser as Usuario);
      } else {
        setUser({ id: userId, email, nombre: email.split('@')[0], rol: 'viewer', pais_id: null, compania_id: null, organizacion_id: null, created_at: new Date().toISOString() });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setUser({ id: userId, email, nombre: email.split('@')[0], rol: 'viewer', pais_id: null, compania_id: null, organizacion_id: null, created_at: new Date().toISOString() });
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      timeoutRef.current = setTimeout(() => {
        setIsLoading(false);
      }, 4000);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setSessionUser(session.user);
          await fetchUserProfile(session.user.id, session.user.email || '');
        }
      } catch (err) {
        console.error('Error getting session:', err);
      } finally {
        clearLoading();
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSessionUser(session.user);
        fetchUserProfile(session.user.id, session.user.email || '').catch((err) => {
          console.error('Error in auth state change:', err);
          setUser({ id: session.user.id, email: session.user.email || '', nombre: session.user.email?.split('@')[0] || '', rol: 'viewer', pais_id: null, compania_id: null, organizacion_id: null, created_at: new Date().toISOString() });
        });
      } else {
        setSessionUser(null);
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [fetchUserProfile, clearLoading]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        clearLoading();
        return false;
      }
      setSessionUser(data.user);
      await fetchUserProfile(data.user.id, data.user.email || '');
      clearLoading();
      return true;
    } catch (err) {
      console.error('Login error:', err);
      clearLoading();
      return false;
    }
  }, [fetchUserProfile, clearLoading]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSessionUser(null);
  }, []);

  const rol = user?.rol || 'viewer';
  const isSuperAdmin = rol === 'super_admin';
  const isAdmin = rol === 'super_admin' || rol === 'admin';
  const isEditor = rol === 'super_admin' || rol === 'admin' || rol === 'editor';
  const isViewer = true; // todos pueden ver

  const userScope: UserScope = {
    pais_id: user?.pais_id || null,
    compania_id: user?.compania_id || null,
    organizacion_id: user?.organizacion_id || null,
  };

  const hasScope = userScope.pais_id !== null || userScope.compania_id !== null || userScope.organizacion_id !== null;

  const canEdit = rol === 'super_admin' || rol === 'admin' || rol === 'editor';
  const canDelete = rol === 'super_admin' || rol === 'admin';

  return (
    <AuthContext.Provider value={{
      user,
      sessionUser,
      isLoading,
      login,
      logout,
      isAdmin,
      isSuperAdmin,
      isEditor,
      isViewer,
      hasScope,
      userScope,
      canEdit,
      canDelete,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}