import { useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ModuleName } from '@/types';

interface ScopeFilter {
  field: string;
  value: string;
}

export function usePermissions() {
  const { user, isSuperAdmin, isAdmin, isEditor, canEdit, canDelete, userScope, hasScope } = useAuth();

  /** Returns the .eq() filters to apply to a Supabase query based on user scope */
  const scopeFilters = useMemo((): ScopeFilter[] => {
    if (isSuperAdmin) return [];
    const filters: ScopeFilter[] = [];
    // Priority: compania > pais > organizacion (most specific wins)
    if (userScope.compania_id) {
      filters.push({ field: 'compania_id', value: userScope.compania_id });
    } else if (userScope.pais_id) {
      filters.push({ field: 'pais_id', value: userScope.pais_id });
    } else if (userScope.organizacion_id) {
      filters.push({ field: 'organizacion_id', value: userScope.organizacion_id });
    }
    return filters;
  }, [isSuperAdmin, userScope]);

  /** Applies scope filters to a Supabase query builder */
  const applyScopeToQuery = useCallback(
    (query: { eq: (field: string, value: string) => unknown }, tableHasScope: boolean = true) => {
      if (isSuperAdmin || !tableHasScope) return;
      for (const filter of scopeFilters) {
        query.eq(filter.field, filter.value);
      }
    },
    [isSuperAdmin, scopeFilters]
  );

  /** Checks if a module is accessible for the user's role */
  const canAccessModule = useCallback(
    (module: ModuleName): boolean => {
      // Configuración solo super_admin y admin
      if (module === 'configuracion') return isAdmin;
      // Todos los demás módulos visibles para todos los roles
      return true;
    },
    [isAdmin]
  );

  /** Returns label for current role */
  const rolLabel = useMemo(() => {
    const map: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Administrador',
      editor: 'Editor',
      viewer: 'Visualizador',
    };
    return map[user?.rol || 'viewer'] || 'Visualizador';
  }, [user]);

  return {
    isSuperAdmin,
    isAdmin,
    isEditor,
    canEdit,
    canDelete,
    userScope,
    hasScope,
    scopeFilters,
    applyScopeToQuery,
    canAccessModule,
    rolLabel,
  };
}