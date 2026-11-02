import * as Linking from 'expo-linking';
import { createContext, PropsWithChildren, useCallback, useContext, useState } from 'react';

import { parseShareToken } from '@/lib/share-link';
import { useSession } from '@/lib/session';

type ShareLinkContextValue = {
  pendingToken: string | null;
  clearPendingToken: () => void;
};

const ShareLinkContext = createContext<ShareLinkContextValue | undefined>(undefined);

export function ShareLinkProvider({ children }: PropsWithChildren) {
  const { session, loading } = useSession();
  const url = Linking.useLinkingURL();

  const key = `${loading}|${session ? '1' : '0'}|${url ?? ''}`;
  const [pendingToken, setPendingToken] = useState<string | null>(() =>
    !loading && !session && url ? parseShareToken(url) : null,
  );
  const [prevKey, setPrevKey] = useState<string>(key);
  if (prevKey !== key) {
    setPrevKey(key);
    const token = !loading && !session && url ? parseShareToken(url) : null;
    if (token) {
      setPendingToken(token);
    }
  }

  const clearPendingToken = useCallback(() => setPendingToken(null), []);

  return (
    <ShareLinkContext.Provider value={{ pendingToken, clearPendingToken }}>
      {children}
    </ShareLinkContext.Provider>
  );
}

export function useShareLink() {
  const context = useContext(ShareLinkContext);
  if (!context) {
    throw new Error('useShareLink must be used within a ShareLinkProvider');
  }
  return context;
}
