type PwaUpdateHandler = (registration: ServiceWorkerRegistration) => void;

let hasReloadedForControllerChange = false;

export const registerPwa = (onUpdate: PwaUpdateHandler) => {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdate(registration);
          }
        });
      });

      if (registration.waiting && navigator.serviceWorker.controller) {
        onUpdate(registration);
      }

      window.setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    }).catch((error) => {
      console.warn('Nao foi possivel registrar a PWA.', error);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForControllerChange) return;
    hasReloadedForControllerChange = true;
    window.location.reload();
  });
};

export const applyPwaUpdate = (registration: ServiceWorkerRegistration) => {
  if (!registration.waiting) return;
  registration.waiting.postMessage({type: 'SKIP_WAITING'});
};
