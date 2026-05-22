import React, {createContext, useContext, useEffect, useState} from 'react';
import {collection, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, updateDoc, where} from '../lib/firestore';
import {auth, AuthUser} from '../lib/auth';
import {db} from '../lib/firebase';
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

const findFirstByField = async (collectionName: string, field: string, value: string) => {
  if (!value) return null;
  const snapshot = await getDocs(query(collection(db, collectionName), where(field, '==', value), limit(1)));
  return snapshot.docs[0] || null;
};

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessUser, setAccessUser] = useState<AccessUser | null>(null);
  const [loading, setLoading] = useState(true);

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

    const syncUser = async (authUser: AuthUser | null) => {
      setUser(authUser);
      cleanupSubscriptions();

      if (!authUser) {
        setProfile(null);
        setAccessUser(null);
        if (active) setLoading(false);
        return;
      }

      if (active) setLoading(true);

      const email = authUser.email || '';
      const displayName = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuário';
      const master = isMasterAdmin(authUser);

      let profileDoc: any =
        await findFirstByField('profiles', 'authUserId', authUser.id) ||
        await findFirstByField('profiles', 'email', email);

      if (!profileDoc) {
        const profileRef = doc(db, 'profiles', authUser.id);
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
        await updateDoc(profileDoc.ref, {
          authUserId: authUser.id,
          email,
          name: profileDoc.data()?.name || displayName,
        });
      }

      let accessUserDoc: any =
        await findFirstByField('users', 'authUserId', authUser.id) ||
        await findFirstByField('users', 'email', email);

      if (!accessUserDoc) {
        const accessRef = doc(db, 'users', authUser.id);
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
        await updateDoc(accessUserDoc.ref, {
          authUserId: authUser.id,
          email,
          name: accessUserDoc.data()?.name || displayName,
          nome: accessUserDoc.data()?.nome || displayName,
        });
      }

      const profileRef = doc(db, 'profiles', profileDoc.id);
      const accessRef = doc(db, 'users', accessUserDoc.id);

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

    const {data: authSubscription} = auth.onAuthStateChange((_event, _session, currentUser) => {
      void syncUser(currentUser);
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
