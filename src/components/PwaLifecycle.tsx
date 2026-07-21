import React from 'react';
import {Download, RefreshCcw, WifiOff, X} from 'lucide-react';
import {applyPwaUpdate, registerPwa} from '../lib/pwa';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
};

const ANDROID_INSTALL_DISMISSED_KEY = 'dcoratto:pwa-install-dismissed';
const IOS_INSTALL_DISMISSED_KEY = 'dcoratto:pwa-ios-install-dismissed';

const isStandaloneDisplay = () => (
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & {standalone?: boolean}).standalone)
);

const isIosSafari = () => {
  const userAgent = window.navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  return isiOS && isSafari;
};

const hasPossibleUnsavedWork = () => {
  const activeElement = document.activeElement;
  const activeFormControl = activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;
  const hasModalOpen = Boolean(document.querySelector('.fixed.inset-0.z-50'));
  const hasFilledForm = Array.from(document.querySelectorAll('form input, form textarea, form select')).some((element) => {
    if (element instanceof HTMLInputElement) {
      if (['button', 'hidden', 'image', 'reset', 'submit'].includes(element.type)) return false;
      if (['checkbox', 'radio'].includes(element.type)) return element.checked;
      if (element.type === 'file') return Boolean(element.files?.length);
      return Boolean(element.value.trim());
    }
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return Boolean(element.value.trim());
    }
    return false;
  });

  return activeFormControl || hasModalOpen || hasFilledForm;
};

export const PwaLifecycle: React.FC = () => {
  const [updateRegistration, setUpdateRegistration] = React.useState<ServiceWorkerRegistration | null>(null);
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);

  React.useEffect(() => {
    registerPwa(setUpdateRegistration);

    const handleBeforeInstallPrompt = (event: Event) => {
      if (localStorage.getItem(ANDROID_INSTALL_DISMISSED_KEY) === 'true' || isStandaloneDisplay()) return;
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      localStorage.setItem(ANDROID_INSTALL_DISMISSED_KEY, 'true');
      setInstallPrompt(null);
      setShowIosInstall(false);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (
      isIosSafari() &&
      !isStandaloneDisplay() &&
      localStorage.getItem(IOS_INSTALL_DISMISSED_KEY) !== 'true'
    ) {
      setShowIosInstall(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const dismissAndroidInstall = () => {
    localStorage.setItem(ANDROID_INSTALL_DISMISSED_KEY, 'true');
    setInstallPrompt(null);
  };

  const dismissIosInstall = () => {
    localStorage.setItem(IOS_INSTALL_DISMISSED_KEY, 'true');
    setShowIosInstall(false);
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') {
      localStorage.setItem(ANDROID_INSTALL_DISMISSED_KEY, 'true');
      setInstallPrompt(null);
    }
  };

  const handleUpdate = () => {
    if (!updateRegistration) return;
    if (
      hasPossibleUnsavedWork() &&
      !window.confirm('Existe formulario, modal ou acao em andamento. Atualizar agora pode descartar informacoes nao salvas. Deseja atualizar mesmo assim?')
    ) {
      return;
    }
    applyPwaUpdate(updateRegistration);
  };

  if (!updateRegistration && !installPrompt && !showIosInstall && isOnline) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-xl flex-col gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[min(420px,calc(100vw-2rem))]">
      {!isOnline ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-lg shadow-slate-900/10">
          <div className="flex items-start gap-3">
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
            <span>Voce esta sem conexao. Alguns dados podem nao estar disponiveis.</span>
          </div>
        </div>
      ) : null}

      {updateRegistration ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-900/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-slate-700">Uma nova versao do D'Coratto esta disponivel.</div>
            <button
              type="button"
              onClick={handleUpdate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
            >
              <RefreshCcw className="h-4 w-4" />
              Atualizar agora
            </button>
          </div>
        </div>
      ) : null}

      {installPrompt ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-900/10">
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800">Instalar D'Coratto</div>
              <div className="mt-1 text-xs font-medium text-slate-500">Adicione o sistema a tela inicial deste aparelho.</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={handleInstall} className="min-h-10 rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white">
                  Instalar
                </button>
                <button type="button" onClick={dismissAndroidInstall} className="min-h-10 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                  Agora nao
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showIosInstall ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-900/10">
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
            <div className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
              Para instalar o D'Coratto: toque em Compartilhar e depois em Adicionar a Tela de Inicio.
            </div>
            <button type="button" onClick={dismissIosInstall} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Fechar orientacao de instalacao">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
