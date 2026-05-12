import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessUser, setAccessUser] = useState<AccessUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribeAccessUser: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }
      if (unsubscribeAccessUser) {
        unsubscribeAccessUser();
        unsubscribeAccessUser = undefined;
      }

      if (user) {
        // First check if profile exists, if not create it
        const profileRef = doc(db, 'profiles', user.uid);
        const profileDoc = await getDoc(profileRef);
        
        if (!profileDoc.exists()) {
          const adminEmails = ['brian_takiya77@outlook.com', 'briank.o.t2019@gmail.com'];
          const isInitialAdmin = adminEmails.includes(user.email || '');
          const newProfile: Profile = {
            uid: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'User',
            email: user.email || '',
            role: isInitialAdmin ?'admin' : 'user',
            blocked: false,
            phone: '',
          };
          await setDoc(profileRef, newProfile);
        }

        const accessUserRef = doc(db, 'users', user.uid);
        const accessUserDoc = await getDoc(accessUserRef);
        const master = isMasterAdmin(user);
        if (!accessUserDoc.exists()) {
          const role = master ?'administrativo' : 'vendedor';
          await setDoc(accessUserRef, {
            uid: user.uid,
            nome: user.displayName || user.email?.split('@')[0] || 'Usuário',
            name: user.displayName || user.email?.split('@')[0] || 'Usuário',
            email: user.email || '',
            role,
            permissions: master ?getDefaultPermissions('administrativo') : getDefaultPermissions('vendedor'),
            blocked: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        // Subscribe to real-time updates
        unsubscribeProfile = onSnapshot(profileRef, (doc) => {
          if (doc.exists()) {
            setProfile(doc.data() as Profile);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error listening to profile:", error);
          setLoading(false);
        });
        unsubscribeAccessUser = onSnapshot(accessUserRef, (snapshot) => {
          if (snapshot.exists()) {
            setAccessUser({uid: user.uid, ...snapshot.data()} as AccessUser);
          } else if (master) {
            setAccessUser({
              uid: user.uid,
              nome: user.displayName || MASTER_ADMIN_EMAIL,
              name: user.displayName || MASTER_ADMIN_EMAIL,
              email: user.email || MASTER_ADMIN_EMAIL,
              role: 'administrativo',
              permissions: getDefaultPermissions('administrativo'),
              blocked: false,
            });
          }
          setLoading(false);
        }, (error) => {
          console.error('Error listening to access user:', error);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setAccessUser(null);
        setLoading(false);
      }
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
    <AuthContext.Provider value={{ user, profile, accessUser, loading, isAdmin, isMasterAdmin: masterAdmin, hasPermission, canEvaluateEmployees: canEvaluate }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
