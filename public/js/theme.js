/* ============================================
   AGOGE - Gestion des thèmes (choix de style)
   ============================================ */
const ThemeManager = (() => {
  const STORAGE_KEY = 'agoge_theme';
  const DEFAULT_THEME = 'noir';

  const THEMES = [
    { id: 'noir', label: 'Spartan noir', desc: 'Rouge & noir', primary: '#e8214f', accent: '#e8214f' },
    { id: 'marbre', label: 'Marbre & bronze', desc: 'Clair antique', primary: '#a5652f', accent: '#7c8c5f' },
    { id: 'militaire', label: 'Militaire tactique', desc: 'Olive & orange', primary: '#d97b29', accent: '#8fae4f' },
    { id: 'minimal', label: 'Ascèse minimaliste', desc: 'Pur & sobre', primary: '#e8214f', accent: '#f0f0f0' },
    { id: 'arene', label: 'Arène', desc: 'Bordeaux & or', primary: '#7a1f1f', accent: '#c9a35a' }
  ];

  function isValid(id) {
    return THEMES.some((t) => t.id === id);
  }

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setStored(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) {}
  }

  function getCurrent() {
    const stored = getStored();
    return isValid(stored) ? stored : DEFAULT_THEME;
  }

  function apply(theme, opts = {}) {
    const id = isValid(theme) ? theme : DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', id);
    if (opts.persist) setStored(id);
    return id;
  }

  // Applique immédiatement puis persiste côté serveur (best effort)
  async function setTheme(theme) {
    const id = apply(theme, { persist: true });
    try {
      await API.setTheme(id);
    } catch (e) {
      console.log('⚠️ Thème non sauvegardé côté serveur :', e.message);
    }
    return id;
  }

  // Au démarrage : priorité au profil serveur, sinon localStorage
  async function init(profile) {
    let theme = getStored();
    if (profile && isValid(profile.theme)) theme = profile.theme;
    return apply(theme, { persist: true });
  }

  return { THEMES, DEFAULT_THEME, getCurrent, apply, setTheme, init };
})();

window.ThemeManager = ThemeManager;

