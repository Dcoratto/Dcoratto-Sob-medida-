import React, { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Logo } from '../components/layout/Logo';
import { Mail, Lock, User as UserIcon, ArrowRight, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches || /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
  };

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    let active = true;

    const resolveRedirectResult = async () => {
      try {
        await getRedirectResult(auth);
      } catch (err: any) {
        if (!active) return;
        setError(translateError(err?.code));
      }
    };

    resolveRedirectResult();

    return () => {
      active = false;
    };
  }, []);

  const translateError = (code: string) => {
    switch (code) {
      case 'auth/user-not-found': return 'Usuario nao encontrado. Se e seu primeiro acesso, use a aba "Cadastre-se".';
      case 'auth/wrong-password': return 'Senha incorreta.';
      case 'auth/email-already-in-use': return 'Este e-mail ja esta em uso.';
      case 'auth/weak-password': return 'A senha deve ter pelo menos 6 caracteres.';
      case 'auth/invalid-email': return 'E-mail invalido.';
      case 'auth/operation-not-allowed': return 'O login por e-mail e senha nao esta ativado no Firebase. Ative em Authentication > Sign-in Method.';
      case 'auth/popup-blocked': return 'O navegador bloqueou a janela do Google. Tente novamente ou continue pelo redirecionamento.';
      case 'auth/popup-closed-by-user': return 'A janela do Google foi fechada antes da conclusao do login.';
      case 'auth/cancelled-popup-request': return 'O pedido de login com Google foi cancelado. Tente novamente.';
      case 'auth/unauthorized-domain': return 'Este dominio ainda nao esta autorizado no Firebase para login com Google. Adicione este endereco em Authentication > Settings > Authorized domains.';
      case 'auth/account-exists-with-different-credential': return 'Ja existe uma conta com este e-mail usando outro metodo de login.';
      default: return 'Ocorreu um erro. Tente novamente.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(translateError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Por favor, insira seu e-mail primeiro.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('E-mail de recuperacao enviado com sucesso!');
      setError('');
    } catch (err: any) {
      setError(translateError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isMobileDevice()) {
        await signInWithRedirect(auth, provider);
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(translateError(err?.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBFBFD] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[32px] shadow-2xl shadow-slate-200/50 p-8 md:p-12 border border-slate-100"
      >
        <div className="flex flex-col items-center mb-10">
          <Logo className="scale-125 mb-4" />
          <h1 className="text-2xl font-display font-semibold text-slate-900">
            {isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </h1>
          <p className="text-slate-500 text-sm mt-2 text-center">
            {isLogin
              ? 'Acesse o sistema de gestao da DCoratto Sob Medida'
              : 'Comece a gerenciar seus orcamentos agora mesmo'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="relative"
              >
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nome completo"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all placeholder:text-slate-400"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="email"
              placeholder="E-mail"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="password"
              placeholder="Senha"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          {isLogin && (
            <div className="flex justify-end px-2">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3" />
                Esqueceu sua senha?
              </button>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-xs px-2 font-medium">{error}</p>
          )}

          {success && (
            <p className="text-green-600 text-xs px-2 font-medium">{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isLogin ? 'Entrar' : 'Cadastrar'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8">
          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <span className="relative px-4 bg-white text-xs font-medium text-slate-400 uppercase tracking-widest">
              ou continue com
            </span>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-medium text-slate-700 shadow-sm active:scale-[0.98] disabled:opacity-60"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            {loading ? 'Abrindo Google...' : 'Google'}
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          {isLogin ? 'Nao tem uma conta?' : 'Ja possui uma conta?'}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="ml-1 font-semibold text-brand-primary hover:underline"
          >
            {isLogin ? 'Cadastre-se' : 'Faca login'}
          </button>
        </p>
      </motion.div>
    </div>
  );
};
