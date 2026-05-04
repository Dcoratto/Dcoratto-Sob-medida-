import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Logo } from '../components/layout/Logo';
import { Mail, Lock, User as UserIcon, LogIn, ArrowRight, KeyRound } from 'lucide-react';
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

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

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
      setSuccess('E-mail de recuperação enviado com sucesso!');
      setError('');
    } catch (err: any) {
      setError(translateError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const translateError = (code: string) => {
    switch (code) {
      case 'auth/user-not-found': return 'Usuário não encontrado. Se é seu primeiro acesso, use a aba "Cadastre-se".';
      case 'auth/wrong-password': return 'Senha incorreta.';
      case 'auth/email-already-in-use': return 'Este e-mail já está em uso.';
      case 'auth/weak-password': return 'A senha deve ter pelo menos 6 caracteres.';
      case 'auth/invalid-email': return 'E-mail inválido.';
      case 'auth/operation-not-allowed': return 'O login por E-mail/Senha não está ativado no Console do Firebase. Ative-o em Authentication > Sign-in Method.';
      default: return 'Ocorreu um erro. Tente novamente.';
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
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
              ? 'Acesse o sistema de gestão da D’Coratto Sob Medida' 
              : 'Comece a gerenciar seus orçamentos agora mesmo'}
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
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-medium text-slate-700 shadow-sm active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Google
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          {isLogin ? 'Não tem uma conta?' : 'Já possui uma conta?'}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="ml-1 font-semibold text-brand-primary hover:underline"
          >
            {isLogin ? 'Cadastre-se' : 'Faça login'}
          </button>
        </p>
      </motion.div>
    </div>
  );
};
