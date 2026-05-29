import type {AuthChangeEvent, EmailOtpType, Session, User} from '@supabase/supabase-js';
import {supabase} from './supabase';

const authRedirectUrl = () => {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/auth/confirm`;
};

const authListener = (
  callback: (event: AuthChangeEvent, session: Session | null, user: User | null) => void,
) => supabase.auth.onAuthStateChange((event, session) => callback(event, session, session?.user ?? null));

const getCurrentUser = async () => {
  const {data: sessionData} = await supabase.auth.getSession();
  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

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
        emailRedirectTo: authRedirectUrl(),
      },
    }),
  signInWithOtp: (email: string) =>
    supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: authRedirectUrl(),
      },
    }),
  signInWithGoogle: () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectUrl(),
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    }),
  resetPasswordForEmail: (email: string) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl(),
    }),
  verifyEmailOtp: (tokenHash: string, type: EmailOtpType) =>
    supabase.auth.verifyOtp({token_hash: tokenHash, type}),
  updatePassword: (password: string) =>
    supabase.auth.updateUser({password}),
  signOut: () => supabase.auth.signOut(),
};

export type AuthUser = User;
