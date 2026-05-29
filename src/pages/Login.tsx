import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {auth} from '../lib/auth';
import {useAuth} from '../contexts/AuthContext';
import {Logo} from '../components/layout/Logo';
import {Mail, Lock, User as UserIcon, ArrowRight, KeyRound, Link as LinkIcon} from 'lucide-react';
import {motion, AnimatePresence} from 'motion/react';

type AuthScreenMode = 'login' | 'signup' | 'recovery';

const getAuthScreenMode = (): AuthScreenMode => {
  if (typeof window === 'undefined') return 'login';

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const authType = (hashParams.get('type') || searchParams.get('type') || '').toLowerCase();

  if (authType === 'recovery') return 'recovery';
  if (authType === 'invite') return 'signup';
  return 'login';
};

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const {user, loading: authLoading} = useAuth();
  const [mode, setMode] = useState<AuthScreenMode>(() => getAuthScreenMode());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';
  const isRecovery = mode === 'recovery';

  useEffect(() => {
    setMode(getAuthScreenMode());
  }, []);

  useEffect(() => {
    if (!authLoading && user && !isRecovery) {
      navigate('/');
    }
  }, [user, authLoading, isRecovery, navigate]);

  const translateError = (message: string) => {
    const text = String(message || '').toLowerCase();
    if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (text.includes('email not confirmed')) return 'Confirme o link enviado para seu e-mail antes de entrar.';
    if (text.includes('user already registered')) return 'Este e-mail já está cadastrado. Use entrar ou link por e-mail.';
    if (text.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
    if (text.includes('invalid email')) return 'E-mail inválido.';
    if (text.includes('auth session missing')) return 'Abra novamente o link recebido por e-mail para redefinir sua senha.';
    return 'Ocorreu um erro. Tente novamente.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isRecovery) {
        const {error: updateError} = await auth.updatePassword(password);
        if (updateError) throw updateError;
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, '/login');
        }
        setSuccess('Senha atualizada com sucesso. Você já pode entrar no sistema.');
        setPassword('');
        setMode('login');
        navigate('/');
      } else if (isLogin) {
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

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const {error: googleError} = await auth.signInWithGoogle();
      if (googleError) throw googleError;
    } catch (err: any) {
      setError(translateError(err?.message || err?.code || ''));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBFBFD] p-6">
      <motion.div
        initial={{opacity: 0, y: 20}}
        animate={{opacity: 1, y: 0}}
        className="w-full max-w-md rounded-[32px] border border-slate-100 bg-white p-8 shadow-2xl shadow-slate-200/50 md:p-12"
      >
        <div className="mb-10 flex flex-col items-center">
          <Logo className="mb-4 scale-125" />
          <h1 className="text-2xl font-display font-semibold text-slate-900">
            {isRecovery ? 'Defina sua nova senha' : isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </h1>
          <p className="mt-2 text-center text-sm text-slate-500">
            {isRecovery
              ? 'Crie uma nova senha para concluir sua recuperação de acesso'
              : isLogin
                ? 'Entre com senha ou receba um link por e-mail para acessar'
                : 'Crie um novo acesso usando o Supabase'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {!isLogin && !isRecovery && (
              <motion.div
                initial={{opacity: 0, height: 0}}
                animate={{opacity: 1, height: 'auto'}}
                exit={{opacity: 0, height: 0}}
                className="relative"
              >
                <UserIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nome completo"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 outline-none transition-all placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {!isRecovery && (
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                placeholder="E-mail"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 outline-none transition-all placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              />
            </div>
          )}

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              placeholder={isRecovery ? 'Nova senha' : isLogin ? 'Senha' : 'Crie uma senha'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 outline-none transition-all placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>

          {isLogin && (
            <div className="flex flex-wrap justify-end gap-3 px-2">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
              >
                <KeyRound className="h-3 w-3" />
                Esqueceu sua senha?
              </button>
            </div>
          )}

          {error && (
            <p className="px-2 text-xs font-medium text-red-500">{error}</p>
          )}

          {success && (
            <p className="px-2 text-xs font-medium text-green-600">{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary py-4 font-semibold text-white shadow-lg shadow-brand-primary/20 transition-all hover:bg-brand-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                {isRecovery ? 'Salvar nova senha' : isLogin ? 'Entrar' : 'Cadastrar'}
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>

        {!isRecovery && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ou</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-3.5 font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-[#4285F4]">G</span>
              Entrar com Google
            </button>
          </div>
        )}

        {!isRecovery && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2 text-brand-primary shadow-sm">
                <LinkIcon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-900">Primeiro acesso no Supabase?</div>
                <p className="mt-1 text-xs text-slate-500">
                  Use seu e-mail e toque em receber link. Agora os acessos nascem do zero no Supabase e não reaproveitam usuários antigos do Firebase.
                </p>
                <button
                  type="button"
                  onClick={handleEmailLink}
                  disabled={loading}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  <Mail className="h-4 w-4" />
                  Receber link por e-mail
                </button>
              </div>
            </div>
          </div>
        )}

        {!isRecovery && (
          <p className="mt-8 text-center text-sm text-slate-500">
            {isLogin ? 'Não tem uma conta?' : 'Já possui uma conta?'}
            <button
              onClick={() => setMode(isLogin ? 'signup' : 'login')}
              className="ml-1 font-semibold text-brand-primary hover:underline"
            >
              {isLogin ? 'Cadastre-se' : 'Faça login'}
            </button>
          </p>
        )}
      </motion.div>
    </div>
  );
};
