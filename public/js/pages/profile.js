/* ============================================
   AGOGE - Page Profil utilisateur
   ============================================ */
const ProfilePage = (() => {
  let profile = null;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCreatedAt(value) {
    if (!value) return '—';

    const raw = String(value).trim();
    const candidates = [
      raw,
      raw.includes('T') ? raw : raw.replace(' ', 'T'),
      /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw
    ];

    for (const candidate of candidates) {
      const date = new Date(candidate);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('fr-FR');
      }
    }

    return '—';
  }

  async function render() {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
      profile = await API.getProfile();
      ThemeManager.init(profile);

      const displayName = profile.first_name || profile.name || 'Utilisateur';
      const initial = (displayName || 'U')[0].toUpperCase();

      container.innerHTML = `
        <div class="page-title">${agogeIcon('user')} Profil</div>
        <div class="page-subtitle">Tes informations personnelles</div>

        <div class="card" style="text-align:center;padding:24px">
          <div class="profile-avatar">${initial}</div>
          <div class="profile-name">${escapeHtml(displayName)}</div>
          <div class="profile-email">${escapeHtml(profile.email || '')}</div>
        </div>

        <div class="profile-stats">
          <div class="profile-stat">
            <div class="ps-value">${profile.age || '—'}</div>
            <div class="ps-label">Âge</div>
          </div>
          <div class="profile-stat">
            <div class="ps-value">${profile.height || '—'}</div>
            <div class="ps-label">Taille (cm)</div>
          </div>
          <div class="profile-stat">
            <div class="ps-value">${goalLabel(profile.goal)}</div>
            <div class="ps-label">Objectif</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">${agogeIcon('edit')} Modifier mon profil</div>
          <div class="profile-form">
            <label>Nom / Pseudo
              <input type="text" id="p-name" value="${escapeHtml(profile.name || '')}" required>
            </label>
            <label>Prénom
              <input type="text" id="p-first-name" value="${escapeHtml(profile.first_name || '')}">
            </label>
            <label>Âge
              <input type="number" id="p-age" min="10" max="120" value="${profile.age || ''}">
            </label>
            <label>Taille (cm)
              <input type="number" id="p-height" min="100" max="250" value="${profile.height || ''}">
            </label>
            <label>Objectif
              <select id="p-goal">
                <option value="prise_masse" ${profile.goal === 'prise_masse' ? 'selected' : ''}>Prise de masse</option>
                <option value="seche" ${profile.goal === 'seche' ? 'selected' : ''}>Sèche / Perte de gras</option>
                <option value="maintien" ${profile.goal === 'maintien' ? 'selected' : ''}>Maintien / Recomposition</option>
                <option value="force" ${profile.goal === 'force' ? 'selected' : ''}>Force</option>
              </select>
            </label>
            <button class="btn btn-primary btn-block" onclick="ProfilePage.saveProfile()">${agogeIcon('save')} Enregistrer</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">${agogeIcon('palette')} Apparence</div>
          <p class="card-subtitle">Choisis le style qui te convient</p>
          <div class="theme-grid">
            ${ThemeManager.THEMES.map(t => `
              <button class="theme-option ${ThemeManager.getCurrent() === t.id ? 'active' : ''}" data-theme-id="${t.id}" onclick="ProfilePage.setTheme('${t.id}')">
                <span class="theme-swatch" style="background:linear-gradient(135deg, ${t.accent}, ${t.primary})"></span>
                <span class="theme-name">${t.label}</span>
                <span class="theme-desc">${t.desc}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Données</div>
          <p class="card-subtitle">Compte créé le ${formatCreatedAt(profile.created_at)}</p>
          <button class="btn btn-danger btn-block" style="margin-top:12px" onclick="ProfilePage.logout()">${agogeIcon('logout')} Déconnexion</button>
        </div>

        <div style="height:24px"></div>
      `;
    } catch (e) {
      container.innerHTML = `
        <div class="card">
          <div class="card-title" style="color:var(--danger)">${agogeIcon('warning')} Erreur</div>
          <p class="card-subtitle">${e.message}</p>
        </div>
      `;
    }
  }

  function goalLabel(goal) {
    const labels = {
      'prise_masse': `${agogeIcon('dumbbell')} Prise de masse`,
      'seche': `${agogeIcon('fire')} Sèche`,
      'maintien': `${agogeIcon('weightScale')} Maintien`,
      'force': `${agogeIcon('dumbbell')} Force`
    };
    return labels[goal] || goal || '—';
  }

  async function setTheme(theme) {
    try {
      await ThemeManager.setTheme(theme);
      updateThemeUI();
      showToast(`${agogeIcon('palette')} Style appliqué`);
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  function updateThemeUI() {
    document.querySelectorAll('.theme-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeId === ThemeManager.getCurrent());
    });
  }

  async function saveProfile() {
    const data = {
      name: document.getElementById('p-name').value.trim(),
      first_name: document.getElementById('p-first-name').value.trim() || null,
      age: parseInt(document.getElementById('p-age').value) || null,
      height: parseInt(document.getElementById('p-height').value) || null,
      goal: document.getElementById('p-goal').value
    };
    if (!data.name) {
      showToast('Le nom est requis');
      return;
    }
    try {
      await API.updateProfile(data);
      showToast(`${agogeIcon('check')} Profil mis à jour`);
      render();
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  function logout() {
    if (!confirm('Se déconnecter ?')) return;
    API.setToken(null);
    window.dispatchEvent(new CustomEvent('agoge:logout'));
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerHTML = window.agogeToastMarkup(msg);
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2500);
  }

  return { render, saveProfile, setTheme, logout };
})();

window.ProfilePage = ProfilePage;
