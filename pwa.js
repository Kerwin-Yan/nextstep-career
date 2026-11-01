(() => {
  'use strict';

  const status = {
    version: '20261101-v1',
    supported: 'serviceWorker' in navigator,
    secure: window.isSecureContext === true,
    registered: false,
    offline: navigator.onLine === false,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true,
    installPromptAvailable: false,
    updateAvailable: false,
    updateRequested: false,
    refreshPending: false,
    registrationError: null
  };
  window.NEXTSTEP_PWA_STATUS = status;
  let registration = null;
  let deferredInstallPrompt = null;
  let hadController = Boolean(navigator.serviceWorker?.controller);
  let editingWasConfirmed = false;
  let reloading = false;

  function emitStatus() {
    window.dispatchEvent(new CustomEvent('nextstep:pwa-status', { detail: { ...status } }));
  }

  function isEditing() {
    const candidates = document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"], [data-pwa-editing="true"]');
    return [...candidates].some(element => {
      if (element.hidden || element.closest('[hidden], [aria-hidden="true"]')) return false;
      if (element.getClientRects && element.getClientRects().length === 0) return false;
      const style = window.getComputedStyle?.(element);
      return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    });
  }

  function renderStatus() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator && indicator.hidden !== !status.offline) indicator.hidden = !status.offline;
    const banner = document.getElementById('update-banner');
    if (banner) {
      if (banner.hidden !== !status.updateAvailable) banner.hidden = !status.updateAvailable;
      banner.dataset.pwaState = status.refreshPending && isEditing() ? 'finish-editing' : 'ready';
    }
    const button = document.getElementById('apply-update');
    if (button) {
      button.disabled = status.updateRequested && !status.refreshPending;
      button.textContent = status.refreshPending ? '重新载入' : status.updateRequested ? '正在更新…' : '更新';
    }
    const message = document.getElementById('update-message');
    if (message) {
      message.textContent = status.refreshPending && isEditing()
        ? '更新已就绪，保存或关闭当前编辑后即可载入。'
        : status.refreshPending ? '更新已就绪，重新载入即可使用。' : '有新版本可用。';
    }
    emitStatus();
  }

  function markUpdateAvailable() {
    status.updateAvailable = true;
    renderStatus();
  }

  function reload() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  function confirmEditingRefresh() {
    return !isEditing() || window.confirm('当前有正在编辑的内容。更新会重新载入页面，未保存的内容会丢失。仍要现在更新吗？');
  }

  function applyUpdate() {
    if (!status.refreshPending && !registration?.waiting) return;
    if (!confirmEditingRefresh()) return;
    if (status.refreshPending) {
      reload();
      return;
    }
    editingWasConfirmed = isEditing();
    status.updateRequested = true;
    renderStatus();
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  function resumeDeferredRefresh() {
    if (!status.refreshPending) return;
    if (status.updateRequested && !isEditing()) reload();
    else renderStatus();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    status.installPromptAvailable = true;
    emitStatus();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    status.installPromptAvailable = false;
    status.standalone = true;
    emitStatus();
  });

  async function installFromBrowser() {
    if (!deferredInstallPrompt) return;
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    status.installPromptAvailable = false;
    emitStatus();
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      // Browser installation remains optional; no unsupported prompt is fabricated.
    }
  }

  async function init() {
    document.getElementById('apply-update')?.addEventListener('click', applyUpdate);
    document.getElementById('install-app')?.addEventListener('click', installFromBrowser);
    window.addEventListener('online', () => { status.offline = false; renderStatus(); });
    window.addEventListener('offline', () => { status.offline = true; renderStatus(); });
    document.addEventListener('close', resumeDeferredRefresh, true);
    window.addEventListener('nextstep:editing-changed', resumeDeferredRefresh);
    if ('MutationObserver' in window) {
      new MutationObserver(resumeDeferredRefresh).observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ['open', 'hidden', 'aria-hidden', 'data-pwa-editing', 'style']
      });
    }
    renderStatus();
    if (!status.supported || !status.secure) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController && !status.updateRequested) {
        hadController = true;
        emitStatus();
        return;
      }
      hadController = true;
      status.refreshPending = true;
      status.updateAvailable = true;
      if (status.updateRequested && (!isEditing() || editingWasConfirmed)) reload();
      else renderStatus();
    });

    try {
      registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      status.registered = true;
      if (registration.waiting) markUpdateAvailable();
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) markUpdateAvailable();
          if (installing.state === 'redundant' && status.updateRequested) {
            status.updateRequested = false;
            renderStatus();
          }
        });
      });
      emitStatus();
    } catch (error) {
      status.registrationError = 'registration-failed';
      emitStatus();
      console.warn('下一程的离线支持暂未启用。', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
