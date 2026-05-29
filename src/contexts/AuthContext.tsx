import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import {doc, getDoc, onSnapshot, setDoc, updateDoc} from '../lib/firestore';
import {auth, AuthUser} from '../lib/auth';
import {db} from '../lib/firestore';
import {AccessUser, Profile} from '../types';
import {getDefaultPermissions, isMasterAdmin, MASTER_ADMIN_EMAIL} from '../lib/permissions';

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  accessUser: AccessUser | null;
  appUid: string;
  loading: boolean;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  hasPermission: (modulo: any, acao: any) => boolean;
  canEvaluateEmployees: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  accessUser: null,
  appUid: '',
  loading: true,
  isAdmin: false,
  isMasterAdmin: false,
  hasPermission: () => false,
  canEvaluateEmployees: false,
});

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessUser, setAccessUser] = useState<AccessUser | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef('');

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribeAccessUser: (() => void) | undefined;
    let active = true;

    const cleanupSubscriptions = () => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      unsubscribeAccessUser?.();
      unsubscribeAccessUser = undefined;
    };

    const syncUser = async (authUser: AuthUser | null, options?: {preserveView?: boolean}) => {
      const nextUserId = authUser?.id || '';
      const sameUser = nextUserId && nextUserId === currentUserIdRef.current;
      currentUserIdRef.current = nextUserId;
      setUser(authUser);
      cleanupSubscriptions();

      if (!authUser) {
        setProfile(null);
        setAccessUser(null);
        if (active) setLoading(false);
        return;
      }

      if (active && !options?.preserveView && !sameUser) setLoading(true);

      const email = authUser.email || '';
      const displayName = authUser.user_metadata?.name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Usuário';
      const master = isMasterAdmin(authUser);

      const profileRef = doc(db, 'profiles', authUser.id);
      let profileDoc: any = await getDoc(profileRef);

      if (!profileDoc.exists()) {
        await setDoc(profileRef, {
          name: displayName,
          email,
          role: master ? 'admin' : 'user',
          blocked: false,
          phone: '',
          authUserId: authUser.id,
        });
        profileDoc = await getDoc(profileRef);
      } else if (profileDoc.data()?.authUserId !== authUser.id) {
        await updateDoc(profileRef, {
          authUserId: authUser.id,
          email,
          name: profileDoc.data()?.name || displayName,
        });
      }

      const accessRef = doc(db, 'users', authUser.id);
      let accessUserDoc: any = await getDoc(accessRef);

      if (!accessUserDoc.exists()) {
        const role = master ? 'administrativo' : 'vendedor';
        await setDoc(accessRef, {
          nome: displayName,
          name: displayName,
          email,
          role,
          permissions: master ? getDefaultPermissions('administrativo') : getDefaultPermissions('vendedor'),
          blocked: false,
          authUserId: authUser.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        accessUserDoc = await getDoc(accessRef);
      } else if (accessUserDoc.data()?.authUserId !== authUser.id) {
        await updateDoc(accessRef, {
          authUserId: authUser.id,
          email,
          name: accessUserDoc.data()?.name || displayName,
          nome: accessUserDoc.data()?.nome || displayName,
        });
      }

      let profileResolved = false;
      let accessResolved = false;
      const resolveLoadingIfReady = () => {
        if (profileResolved && accessResolved && active) {
          setLoading(false);
        }
      };

      unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
        if (snapshot.exists()) {
          setProfile({uid: snapshot.id, ...(snapshot.data() as object)} as Profile);
        } else {
          setProfile(null);
        }
        profileResolved = true;
        resolveLoadingIfReady();
      }, () => {
        profileResolved = true;
        resolveLoadingIfReady();
      });

      unsubscribeAccessUser = onSnapshot(accessRef, (snapshot) => {
        if (snapshot.exists()) {
          setAccessUser({uid: snapshot.id, ...(snapshot.data() as object)} as AccessUser);
        } else if (master) {
          setAccessUser({
            uid: authUser.id,
            nome: displayName,
            name: displayName,
            email: email || MASTER_ADMIN_EMAIL,
            role: 'administrativo',
            permissions: getDefaultPermissions('administrativo'),
            blocked: false,
          });
        } else {
          setAccessUser(null);
        }
        accessResolved = true;
        resolveLoadingIfReady();
      }, () => {
        accessResolved = true;
        resolveLoadingIfReady();
      });
    };

    auth.getCurrentUser()
      .then((currentUser) => syncUser(currentUser))
      .catch(() => {
        if (active) setLoading(false);
      });

    const {data: authSubscription} = auth.onAuthStateChange((event, _session, currentUser) => {
      const preserveView = event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && currentUser?.id === currentUserIdRef.current);
      void syncUser(currentUser, {preserveView});
    });

    return () => {
      active = false;
      cleanupSubscriptions();
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const appUid = accessUser?.uid || profile?.uid || user?.id || '';
  const masterAdmin = isMasterAdmin(user) || isMasterAdmin(accessUser);
  const hasPermission = (modulo: any, acao: any) => {
    if (masterAdmin) return true;
    const custom = (accessUser?.permissions as any)?.[modulo]?.[acao];
    if (typeof custom === 'boolean') return custom;
    const defaults = getDefaultPermissions(accessUser?.role || 'vendedor') as any;
    return Boolean(defaults?.[modulo]?.[acao]);
  };

  const isAdmin = masterAdmin || profile?.role === 'admin' || hasPermission('admin', 'visualizarUsuarios');
  const canEvaluate = masterAdmin || accessUser?.role === 'coordenador' || hasPermission('cliente', 'avaliarFuncionarios');

  return (
    <AuthContext.Provider value={{user, profile, accessUser, appUid, loading, isAdmin, isMasterAdmin: masterAdmin, hasPermission, canEvaluateEmployees: canEvaluate}}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

