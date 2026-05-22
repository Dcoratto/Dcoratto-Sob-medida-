import type {AuthChangeEvent, Session, User} from '@supabase/supabase-js';
import {supabase} from './supabase';

const authListener = (
  callback: (event: AuthChangeEvent, session: Session | null, user: User | null) => void,
) => supabase.auth.onAuthStateChange((event, session) => callback(event, session, session?.user ?? null));

const getCurrentUser = async () => {
  const {data} = await supabase.auth.getUser();
  return data.user ?? null;
};

export const auth = {
  onAuthStateChange: authListener,
  getCurrentUser,
  signInWithPassword: (email: string, password: string) =>
    supabase.auth.signInWithPassword({email, password}),
  signUp: (email: string, password: string, name?: string) =>
    supabase.auth.signUp({
      email,
      password,
      options: {
        data: {name: name || ''},
        emailRedirectTo: window.location.origin,
      },
    }),
  signInWithOtp: (email: string) =>
    supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
      },
    }),
  resetPasswordForEmail: (email: string) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    }),
  updatePassword: (password: string) =>
    supabase.auth.updateUser({password}),
  signOut: () => supabase.auth.signOut(),
};

export type AuthUser = User;
