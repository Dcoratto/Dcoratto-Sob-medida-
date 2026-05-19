import React, {createContext, useContext, useEffect, useState} from 'react';
import {onAuthStateChanged, User} from 'firebase/auth';
import {doc, getDoc, onSnapshot, setDoc} from 'firebase/firestore';
import {auth, db} from '../lib/firebase';
import {AccessUser, Profile} from '../types';
import {getDefaultPermissions, isMasterAdmin, MASTER_ADMIN_EMAIL} from '../lib/permissions';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  accessUser: AccessUser | null;
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
  loading: true,
  isAdmin: false,
  isMasterAdmin: false,
  hasPermission: () => false,
  canEvaluateEmployees: false,
});

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessUser, setAccessUser] = useState<AccessUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribeAccessUser: (() => void) | undefined;
    let profileResolved = false;
    let accessResolved = false;

    const resolveLoadingIfReady = () => {
      if (profileResolved && accessResolved) {
        setLoading(false);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      setLoading(true);
      profileResolved = false;
      accessResolved = false;

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }
      if (unsubscribeAccessUser) {
        unsubscribeAccessUser();
        unsubscribeAccessUser = undefined;
      }

      if (!authUser) {
        setProfile(null);
        setAccessUser(null);
        profileResolved = true;
        accessResolved = true;
        setLoading(false);
        return;
      }

      const profileRef = doc(db, 'profiles', authUser.uid);
      const existingProfile = await getDoc(profileRef);

      if (!existingProfile.exists()) {
        const adminEmails = ['brian_takiya77@outlook.com', 'briank.o.t2019@gmail.com'];
        const isInitialAdmin = adminEmails.includes(authUser.email || '');
        const newProfile: Profile = {
          uid: authUser.uid,
          name: authUser.displayName || authUser.email?.split('@')[0] || 'Usuário',
          email: authUser.email || '',
          role: isInitialAdmin ?'admin' : 'user',
          blocked: false,
          phone: '',
        };
        await setDoc(profileRef, newProfile);
      }

      const accessUserRef = doc(db, 'users', authUser.uid);
      const accessUserDoc = await getDoc(accessUserRef);
      const master = isMasterAdmin(authUser);

      if (!accessUserDoc.exists()) {
        const role = master ?'administrativo' : 'vendedor';
        const fallbackName = authUser.displayName || authUser.email?.split('@')[0] || 'Usuário';
        await setDoc(accessUserRef, {
          uid: authUser.uid,
          nome: fallbackName,
          name: fallbackName,
          email: authUser.email || '',
          role,
          permissions: master ?getDefaultPermissions('administrativo') : getDefaultPermissions('vendedor'),
          blocked: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
        if (snapshot.exists()) {
          setProfile(snapshot.data() as Profile);
        }
        profileResolved = true;
        resolveLoadingIfReady();
      }, (error) => {
        console.error('Error listening to profile:', error);
        profileResolved = true;
        resolveLoadingIfReady();
      });

      unsubscribeAccessUser = onSnapshot(accessUserRef, (snapshot) => {
        if (snapshot.exists()) {
          setAccessUser({uid: authUser.uid, ...snapshot.data()} as AccessUser);
        } else if (master) {
          const fallbackName = authUser.displayName || MASTER_ADMIN_EMAIL;
          setAccessUser({
            uid: authUser.uid,
            nome: fallbackName,
            name: fallbackName,
            email: authUser.email || MASTER_ADMIN_EMAIL,
            role: 'administrativo',
            permissions: getDefaultPermissions('administrativo'),
            blocked: false,
          });
        }
        accessResolved = true;
        resolveLoadingIfReady();
      }, (error) => {
        console.error('Error listening to access user:', error);
        accessResolved = true;
        resolveLoadingIfReady();
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribeAccessUser) unsubscribeAccessUser();
    };
  }, []);

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
    <AuthContext.Provider value={{user, profile, accessUser, loading, isAdmin, isMasterAdmin: masterAdmin, hasPermission, canEvaluateEmployees: canEvaluate}}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
