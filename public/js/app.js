/* ============================================
   AGOGE - Application principale (routeur SPA)
   ============================================ */
const App = (() => {
  let currentRoute = 'home';
  let currentParams = {};

  // ---------- INIT ----------
  async function init() {
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '0.0.0.0' || window.location.protocol === 'file:';

    // Service worker disabled locally to avoid stale assets and fake network errors.
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
        if (!isLocalHost) {
          const reg = await navigator.serviceWorker.register('/sw.js');
          console.log('SW registered', reg);
          await reg.update();
        }
      } catch (e) {
        console.log('SW registration failed', e);
      }
    }

    // Force-refresh stale frontend assets on first load
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (e) {
        console.log('Cache clear failed', e);
      }
    }

    // Listen for sync events from SW
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_NOW') {
          syncOffline();
        }
      });
    }

    // Online/offline detection
    window.addEventListener('online', () => {
      document.getElementById('offline-badge').classList.add('hidden');
      syncOffline();
    });
    window.addEventListener('offline', () => {
      document.getElementById('offline-badge').classList.remove('hidden');
    });

    // Auth logout event
    window.addEventListener('agoge:logout', () => {
      showAuth();
    });

    // Bottom nav clicks
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const route = el.dataset.route;
        if (route) navigate(route);
      });
    });

    // Check auth state
    const token = API.getToken();
    if (token) {
      try {
        const profile = await API.getProfile();
        if (profile) {
          ThemeManager.init(profile);
          showApp();
          navigate('home');
          return;
        }
      } catch (e) {
        // Token invalid, show auth
      }
    }
    // Applique le thème local même sur l'écran de connexion
    ThemeManager.apply(ThemeManager.getCurrent());
    showAuth();
  }

  // ---------- AUTH ----------
  function showAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('view-container').innerHTML = '';
  }

  function showApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  }

  function setupAuthForms() {
    // Switch between login/register
    document.querySelectorAll('[data-auth-switch]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const form = link.dataset.authSwitch;
        document.getElementById('login-form').classList.toggle('hidden', form !== 'login');
        document.getElementById('register-form').classList.toggle('hidden', form !== 'register');
        document.getElementById('auth-error').classList.add('hidden');
      });
    });

    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      try {
        const result = await API.login({ email, password });
        document.getElementById('auth-error').classList.add('hidden');
        ThemeManager.init(result.user || null);
        showApp();
        navigate('home');
      } catch (err) {
        showAuthError(err.message);
      }
    });

    // Register
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('register-name').value.trim();
      const email = document.getElementById('register-email').value.trim();
      const password = document.getElementById('register-password').value;
      const passwordConfirm = document.getElementById('register-password-confirm').value;
      const normalizedPassword = String(password).trim();
      const normalizedPasswordConfirm = String(passwordConfirm).trim();
      const age = parseInt(document.getElementById('register-age').value) || null;
      const height = parseInt(document.getElementById('register-height').value) || null;
      const goal = document.getElementById('register-goal').value;

      if (normalizedPassword !== normalizedPasswordConfirm) {
        showAuthError('Les mots de passe ne correspondent pas');
        return;
      }

      try {
        const result = await API.register({ name, email, password: normalizedPassword, password_confirm: normalizedPasswordConfirm, age, height, goal });
        document.getElementById('auth-error').classList.add('hidden');
        ThemeManager.init(result.user || null);
        showApp();
        navigate('home');
      } catch (err) {
        showAuthError(err.message);
      }
    });
  }

  function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  // ---------- NAVIGATION ----------
  function navigate(route, params = {}) {
    currentRoute = route;
    currentParams = params;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.route === route);
    });

    // Render page
    switch (route) {
      case 'home':
        HomePage.render();
        break;
      case 'sessions':
        if (params.id) SessionsPage.open(params.id);
        else SessionsPage.render();
        break;
      case 'nutrition':
        NutritionPage.render();
        break;
      case 'body':
        BodyPage.render();
        break;
      case 'profile':
        ProfilePage.render();
        break;
      default:
        HomePage.render();
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  // ---------- OFFLINE SYNC ----------
  async function syncOffline() {
    try {
      const result = await API.syncNow();
      if (result.synced > 0) {
        showToast(`🔄 ${result.synced} action(s) synchronisée(s)`);
        // Re-render current page to refresh data
        navigate(currentRoute, currentParams);
      }
    } catch (e) {
      console.log('Sync error', e);
    }
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2500);
  }

  // ---------- START ----------
  document.addEventListener('DOMContentLoaded', () => {
    setupAuthForms();
    init();
  });

  return { navigate, syncOffline };
})();

window.App = App;
