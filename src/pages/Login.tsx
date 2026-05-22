import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import { Logo } from '../components/layout/Logo';
import { Mail, Lock, User as UserIcon, ArrowRight, KeyRound, Link as LinkIcon } from 'lucide-react';
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

  const translateError = (message: string) => {
    const text = String(message || '').toLowerCase();
    if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (text.includes('email not confirmed')) return 'Confirme o link enviado para seu e-mail antes de entrar.';
    if (text.includes('user already registered')) return 'Este e-mail já está cadastrado. Use entrar ou link por e-mail.';
    if (text.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
    if (text.includes('invalid email')) return 'E-mail inválido.';
    return 'Ocorreu um erro. Tente novamente.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLogin) {
        const {error: signInError} = await auth.signInWithPassword(email, password);
        if (signInError) throw signInError;
      } else {
        const {error: signUpError} = await auth.signUp(email, password, name.trim());
        if (signUpError) throw signUpError;
        setSuccess('Conta criada. Se o Supabase pedir confirmação, verifique seu e-mail antes de entrar.');
      }
    } catch (err: any) {
      setError(translateError(err?.message || err?.code || ''));
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
      const {error: resetError} = await auth.resetPasswordForEmail(email);
      if (resetError) throw resetError;
      setSuccess('E-mail de recuperação enviado com sucesso.');
      setError('');
    } catch (err: any) {
      setError(translateError(err?.message || err?.code || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLink = async () => {
    if (!email) {
      setError('Digite seu e-mail para receber o link de acesso.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const {error: otpError} = await auth.signInWithOtp(email);
      if (otpError) throw otpError;
      setSuccess('Link de acesso enviado. Abra o e-mail e toque no link para entrar.');
    } catch (err: any) {
      setError(translateError(err?.message || err?.code || ''));
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
              ? 'Entre com senha ou receba um link por e-mail para acessar'
              : 'Crie um novo acesso usando o Supabase'}
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
              placeholder={isLogin ? 'Senha' : 'Crie uma senha'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          {isLogin && (
            <div className="flex flex-wrap justify-end gap-3 px-2">
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

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-2 text-brand-primary shadow-sm">
              <LinkIcon className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-slate-900">Primeiro acesso no Supabase?</div>
              <p className="mt-1 text-xs text-slate-500">
                Use seu e-mail e toque em receber link. Agora os acessos nascem do zero no Supabase e nao reaproveitam usuarios antigos do Firebase.
              </p>
              <button
                type="button"
                onClick={handleEmailLink}
                disabled={loading}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                <Mail className="w-4 h-4" />
                Receber link por e-mail
              </button>
            </div>
          </div>
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


