import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import type {EmailOtpType} from '@supabase/supabase-js';
import {Logo} from '../components/layout/Logo';
import {auth} from '../lib/auth';

const allowedOtpTypes = new Set(['signup', 'email', 'invite', 'magiclink', 'recovery', 'email_change']);

const readableError = (value: string) => {
  const text = String(value || '').toLowerCase();
  if (text.includes('expired')) return 'Este link expirou. Peça um novo link e tente novamente.';
  if (text.includes('invalid')) return 'Este link não é válido ou já foi usado. Peça um novo link e tente novamente.';
  return 'Não foi possível confirmar este link. Peça um novo link e tente novamente.';
};

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Confirmando seu acesso...');
  const [error, setError] = useState('');

  useEffect(() => {
    const finishAuth = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errorDescription = hashParams.get('error_description') || searchParams.get('error_description');

      if (errorDescription) {
        setError(readableError(errorDescription));
        return;
      }

      const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
      const type = (searchParams.get('type') || hashParams.get('type') || 'email').toLowerCase();

      try {
        if (tokenHash) {
          const otpType = allowedOtpTypes.has(type) ? type as EmailOtpType : 'email';
          const {error: verifyError} = await auth.verifyEmailOtp(tokenHash, otpType);
          if (verifyError) throw verifyError;
        } else {
          await auth.getCurrentUser();
        }

        window.history.replaceState({}, document.title, '/auth/confirm');

        if (type === 'recovery') {
          setMessage('Link confirmado. Defina sua nova senha.');
          navigate('/login?type=recovery', {replace: true});
          return;
        }

        setMessage('Acesso confirmado. Entrando no sistema...');
        navigate('/', {replace: true});
      } catch (callbackError: any) {
        setError(readableError(callbackError?.message || callbackError?.code || ''));
      }
    };

    void finishAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBFBFD] p-6">
      <div className="w-full max-w-md rounded-[32px] border border-slate-100 bg-white p-8 text-center shadow-2xl shadow-slate-200/50 md:p-12">
        <Logo className="mx-auto mb-6 scale-125" />
        <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-4 border-brand-primary/15 border-t-brand-primary" />
        <h1 className="font-display text-2xl font-semibold text-slate-900">
          {error ? 'Link não confirmado' : 'Confirmando acesso'}
        </h1>
        <p className={error ? 'mt-3 text-sm font-medium text-red-500' : 'mt-3 text-sm text-slate-500'}>
          {error || message}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => navigate('/login', {replace: true})}
            className="mt-6 rounded-2xl bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90"
          >
            Voltar para o login
          </button>
        )}
      </div>
    </div>
  );
};
