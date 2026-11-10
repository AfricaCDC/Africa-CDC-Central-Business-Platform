import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../services/api';
import usePermissionStore from '@/stores/usePermissionStore';

const AuthContext = createContext(null);

/**
 * React context provider that loads the current user, exposes auth state,
 * and offers a `logout` helper to descendant components (sign-in is Microsoft only).
 * The cached user shows at once; /auth/me then refreshes it (new fields such as
 * division_code). A failed refresh keeps the cached user: the api interceptor
 * handles a 401.
 *
 * @param {{children: React.ReactNode}} props
 * @returns {JSX.Element}
 */
export const AuthProvider = ({ children }) => {
    const hasSession = authService.hasSession();
    const [isLoggedOut, setIsLoggedOut] = useState(false);
    const { data: freshUser, isLoading } = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: authService.fetchProfile,
        enabled: hasSession,
        staleTime: Infinity,
        retry: false,
    });

    // Load the RBAC permissions once the fresh profile is in.
    useEffect(() => {
        if (freshUser) usePermissionStore.getState().load();
    }, [freshUser]);

    const user = isLoggedOut ? null : (freshUser || authService.getCurrentUser());
    const loading = hasSession && isLoading;

    const logout = () => {
        authService.logout();
        setIsLoggedOut(true);
        usePermissionStore.getState().clear();
    };

    return (
        <AuthContext.Provider value={{ user, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

/**
 * Access the current auth context (user, logout, loading).
 *
 * @returns {{user: object|null, logout: Function, loading: boolean}}
 * @example
 * const { user, logout } = useAuth();
 */
export const useAuth = () => useContext(AuthContext);
