import { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface AuthContextType {
  accessToken: string | null;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
  user: any | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);

  const refreshSession = useCallback(async () => {
    const refreshToken = localStorage.getItem('google_refresh_token');
    if (!refreshToken) return false;

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const data = await response.json();
      const { access_token, expires_in } = data;

      setAccessToken(access_token);
      localStorage.setItem('google_access_token', access_token);
      
      // Schedule next refresh slightly before expiration (e.g., 5 minutes before)
      const refreshTime = (expires_in - 300) * 1000;
      if (refreshTime > 0) {
        setTimeout(refreshSession, refreshTime);
      }

      return true;
    } catch (error) {
      console.error("Failed to refresh session:", error);
      // If refresh fails, we might want to clear tokens, but let's keep them for manual retry unless it's a fatal error
      return false;
    }
  }, []);

  useEffect(() => {
    // Load from localStorage on mount
    const storedToken = localStorage.getItem('google_access_token');
    const storedUser = localStorage.getItem('google_user');
    const storedRefreshToken = localStorage.getItem('google_refresh_token');

    if (storedToken) setAccessToken(storedToken);
    if (storedUser) setUser(JSON.parse(storedUser));

    // Attempt to refresh if we have a refresh token (to ensure access token is fresh)
    if (storedRefreshToken) {
      refreshSession();
    }
  }, [refreshSession]);

  const login = async () => {
    try {
      const response = await fetch('/api/auth/url');
      const { url } = await response.json();
      
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      window.open(
        url,
        'google_oauth',
        `width=${width},height=${height},top=${top},left=${left}`
      );

      // Listener is set up once in the component below or globally
    } catch (error) {
      console.error("Failed to start login:", error);
      alert("Failed to initialize login. Please check console.");
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_SUCCESS') {
        const { access_token, refresh_token, expires_in } = event.data.payload;
        
        setAccessToken(access_token);
        localStorage.setItem('google_access_token', access_token);
        
        if (refresh_token) {
          localStorage.setItem('google_refresh_token', refresh_token);
        }
        
        // Fetch user info
        try {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            headers: { Authorization: `Bearer ${access_token}` }
          });
          const userData = await userRes.json();
          setUser(userData);
          localStorage.setItem('google_user', JSON.stringify(userData));
        } catch (e) {
          console.error("Failed to fetch user info", e);
        }

        // Schedule refresh
        const refreshTime = (expires_in - 300) * 1000;
        if (refreshTime > 0) {
          setTimeout(refreshSession, refreshTime);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refreshSession]);

  const logout = () => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_user');
    localStorage.removeItem('google_refresh_token');
  };

  return (
    <AuthContext.Provider value={{ accessToken, isAuthenticated: !!accessToken, login, logout, refreshSession, user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
