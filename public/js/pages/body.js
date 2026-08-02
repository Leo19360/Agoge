/* ============================================
   AGOGE - Page Physique (suivi du poids, mesures, photos)
   ============================================ */
const BodyPage = (() => {
  let weightEntries = [];
  let photos = [];
  let measurements = [];

  async function render() {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
      [weightEntries, photos, measurements] = await Promise.all([
        API.body.weight(),
        API.body.photos(),
        API.body.measurements()
      ]);

      const latestWeight = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].weight : null;

      // Photos HTML
      const sortedPhotos = [...photos].sort((a, b) => new Date(b.date) - new Date(a.date));
      const photosHtml = sortedPhotos.length ? sortedPhotos.map((p) => `
        <div class="photo-item">
          <img src="${p.url}" alt="Photo ${p.date}" loading="lazy">
          <div class="photo-date">${fmtDate(p.date)}</div>
          <button class="photo-delete" onclick="BodyPage.removePhoto(${p.id})">${agogeIcon('close')}</button>
        </div>
      `).join('') : '';

      container.innerHTML = `
        <div class="page-title">${agogeIcon('chart')} Suivi Physique</div>
        <div class="page-subtitle">Poids, mesures et photos de progression</div>

        <div class="card">
          <div class="card-title">${agogeIcon('weightScale')} Poids</div>
          <div class="weight-form">
            <input type="number" id="weight-input" step="0.1" min="20" max="300" placeholder="${latestWeight ? latestWeight.toFixed(1) : '75.0'} kg" value="${latestWeight || ''}">
            <button class="btn btn-primary" onclick="BodyPage.addWeight()">+</button>
          </div>
        </div>

        <div class="chart-container">
          <canvas id="weight-chart"></canvas>
        </div>

        <div class="card">
          <div class="card-title">${agogeIcon('chart')} Derniers relevés</div>
          ${weightEntries.length > 0 ? `
            <div style="font-size:13px">
              ${weightEntries.slice(-7).reverse().map((w) => `
                <div class="progress-list-item">
                  <span>${fmtDateTime(w.created_at)}</span>
                  <span>${Number(w.weight).toFixed(1)} kg</span>
                  <button class="icon-btn" style="width:28px;height:28px;font-size:14px" onclick="BodyPage.removeWeight(${w.id})">${agogeIcon('close')}</button>
                </div>
              `).join('')}
            </div>
          ` : '<p class="card-subtitle">Aucun relevé pour le moment. Ajoute ton premier poids !</p>'}
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">${agogeIcon('image')} Photos de progression</div>
            <button class="btn btn-sm btn-outline" onclick="BodyPage.uploadPhoto()">${agogeIcon('plus')} Ajouter</button>
          </div>
          <div class="photo-upload" onclick="document.getElementById('photo-input').click()">
            <span>${agogeIcon('camera')} Ajoute une photo pour suivre ton évolution chaque semaine ou mois</span>
            <input type="file" id="photo-input" accept="image/*" onchange="BodyPage.handlePhotoUpload(event)" style="display:none">
          </div>
          ${sortedPhotos.length > 0 ? `
            <div class="photo-grid">
              ${photosHtml}
            </div>
            ${sortedPhotos.length >= 2 ? `
              <button class="btn btn-outline btn-block" onclick="BodyPage.comparePhotos()">${agogeIcon('arrowsRotate')} Comparer deux photos</button>
            ` : ''}
            <div class="card-subtitle" style="margin-top:8px">Tu peux enregistrer des photos à intervalles réguliers pour voir ton évolution sur les jours, semaines et mois.</div>
          ` : '<p class="card-subtitle">Aucune photo pour le moment. Ajoute la première photo de référence.</p>'}
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">📏 Mesures corporelles</div>
            <button class="btn btn-sm btn-outline" onclick="BodyPage.measurementModal()">${agogeIcon('plus')} Ajouter</button>
          </div>
          ${measurements.length > 0 ? `
            <div style="font-size:13px">
              ${measurements.slice(-5).reverse().map((m) => `
                <div class="progress-list-item">
                  <span>${fmtDate(m.date)}</span>
                  <span>${m.waist ? 'Taille: ' + m.waist + 'cm' : ''} ${m.arms ? 'Bras: ' + m.arms + 'cm' : ''} ${m.thighs ? 'Cuisses: ' + m.thighs + 'cm' : ''}</span>
                  <button class="icon-btn" style="width:28px;height:28px;font-size:14px" onclick="BodyPage.removeMeasurement(${m.id})">✕</button>
                </div>
              `).join('')}
            </div>
          ` : '<p class="card-subtitle">Aucune mesure pour le moment.</p>'}
        </div>

        <div style="height:24px"></div>
      `;

      // Render weight chart
      setTimeout(() => Charts.weightChart(document.getElementById('weight-chart'), weightEntries), 100);
    } catch (e) {
      container.innerHTML = `
        <div class="card">
          <div class="card-title" style="color:var(--danger)">${agogeIcon('warning')} Erreur</div>
          <p class="card-subtitle">${e.message}</p>
        </div>
      `;
    }
  }

  function fmtDate(d) {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  // Format date + heure pour distinguer plusieurs relevés le même jour
  function fmtDateTime(dt) {
    if (!dt) return fmtDate(new Date().toISOString().slice(0, 10));
    const d = new Date(dt);
    if (isNaN(d.getTime())) return fmtDate(dt);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- POIDS ----------
  async function addWeight() {
    const input = document.getElementById('weight-input');
    const weight = parseFloat(input.value);
    if (!weight || weight <= 0) {
      showToast('Entre un poids valide');
      return;
    }
    try {
      await API.body.addWeight({ weight, date: new Date().toISOString().slice(0, 10) });
      showToast(`${agogeIcon('check')} Poids enregistré`);
      render();
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  async function removeWeight(id) {
    if (!confirm('Supprimer ce relevé de poids ?')) return;
    try {
      await API.body.removeWeight(id);
      showToast(`${agogeIcon('trash')} Relevé supprimé`);
      render();
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  // ---------- PHOTOS ----------
  function uploadPhoto() {
    document.getElementById('photo-input').click();
  }

  async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast(`${agogeIcon('warning')} Sélectionne une image valide`);
      event.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast(`${agogeIcon('warning')} La photo doit faire moins de 10 Mo`);
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('photo', file);
    const date = prompt('Date de la photo (AAAA-MM-JJ)', new Date().toISOString().slice(0, 10));
    if (!date) {
      event.target.value = '';
      return;
    }
    formData.append('date', date);
    try {
      await API.body.uploadPhoto(formData);
      showToast(`${agogeIcon('image')} Photo ajoutée`);
      render();
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
    event.target.value = '';
  }

  async function removePhoto(id) {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await API.body.removePhoto(id);
      showToast(`${agogeIcon('trash')} Photo supprimée`);
      render();
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  function comparePhotos() {
    if (photos.length < 2) {
      showToast('Ajoute au moins 2 photos');
      return;
    }
    const sorted = [...photos].sort((a, b) => new Date(a.date) - new Date(b.date));
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    showModal(`
      <h3 style="color:#fff">${agogeIcon('arrowsRotate')} Comparaison côte à côte <button class="modal-close" onclick="closeModal()" style="color:#fff">✕</button></h3>
      <div class="compare-photos">
        <div>
          <img src="${oldest.url}" alt="Avant" loading="lazy">
          <div class="photo-label">${agogeIcon('calendar')} ${fmtDate(oldest.date)}</div>
        </div>
        <div>
          <img src="${newest.url}" alt="Après" loading="lazy">
          <div class="photo-label">${agogeIcon('calendar')} ${fmtDate(newest.date)}</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:12px;color:var(--text-dim);font-size:13px">
        Vous pouvez aussi sélectionner deux photos spécifiques
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <select id="compare-old" style="flex:1;padding:10px;background:var(--bg-input);border:1px solid #333;border-radius:8px;color:var(--text);font-size:13px">
          <option value="">Sélectionner...</option>
          ${photos.map((p, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${fmtDate(p.date)}</option>`).join('')}
        </select>
        <select id="compare-new" style="flex:1;padding:10px;background:var(--bg-input);border:1px solid #333;border-radius:8px;color:var(--text);font-size:13px">
          <option value="">Sélectionner...</option>
          ${photos.map((p, i) => `<option value="${i}" ${i === photos.length - 1 ? 'selected' : ''}>${fmtDate(p.date)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:12px" onclick="BodyPage.doCompare()">${agogeIcon('arrowsRotate')} Comparer</button>
    `);
  }

  function doCompare() {
    const oldIdx = parseInt(document.getElementById('compare-old').value);
    const newIdx = parseInt(document.getElementById('compare-new').value);
    if (isNaN(oldIdx) || isNaN(newIdx)) {
      showToast('Sélectionne deux photos');
      return;
    }
    const oldPhoto = photos[oldIdx];
    const newPhoto = photos[newIdx];
    const overlay = document.createElement('div');
    overlay.className = 'compare-modal';
    overlay.innerHTML = `
      <button class="compare-close" onclick="this.parentElement.remove()">✕</button>
      <div class="compare-photos">
        <div>
          <img src="${oldPhoto.url}" alt="Avant" loading="lazy">
          <div class="photo-label">${agogeIcon('calendar')} ${fmtDate(oldPhoto.date)}</div>
        </div>
        <div>
          <img src="${newPhoto.url}" alt="Après" loading="lazy">
          <div class="photo-label">${agogeIcon('calendar')} ${fmtDate(newPhoto.date)}</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // ---------- MESURES ----------
  function measurementModal() {
    showModal(`
      <h3>${agogeIcon('ruler')} Nouvelles mesures <button class="modal-close" onclick="closeModal()">✕</button></h3>
      <div class="measure-form">
        <label>Tour de taille (cm)
          <input type="number" id="m-waist" step="0.5" min="0" placeholder="80">
        </label>
        <label>Tour de poitrine (cm)
          <input type="number" id="m-chest" step="0.5" min="0" placeholder="100">
        </label>
        <label>Bras (cm)
          <input type="number" id="m-arms" step="0.5" min="0" placeholder="35">
        </label>
        <label>Cuisses (cm)
          <input type="number" id="m-thighs" step="0.5" min="0" placeholder="55">
        </label>
        <label>Hanches (cm)
          <input type="number" id="m-hips" step="0.5" min="0" placeholder="95">
        </label>
        <label>Épaules (cm)
          <input type="number" id="m-shoulders" step="0.5" min="0" placeholder="110">
        </label>
      </div>
      <button class="btn btn-primary btn-block" onclick="BodyPage.saveMeasurement()">${agogeIcon('save')} Enregistrer</button>
    `);
  }

  async function saveMeasurement() {
    const data = {
      waist: parseFloat(document.getElementById('m-waist').value) || null,
      chest: parseFloat(document.getElementById('m-chest').value) || null,
      arms: parseFloat(document.getElementById('m-arms').value) || null,
      thighs: parseFloat(document.getElementById('m-thighs').value) || null,
      hips: parseFloat(document.getElementById('m-hips').value) || null,
      shoulders: parseFloat(document.getElementById('m-shoulders').value) || null
    };
    const hasAny = Object.values(data).some((v) => v !== null);
    if (!hasAny) {
      showToast('Remplis au moins une mesure');
      return;
    }
    try {
      await API.body.addMeasurement(data);
      closeModal();
      showToast(`${agogeIcon('ruler')} Mesures enregistrées`);
      render();
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  async function removeMeasurement(id) {
    if (!confirm('Supprimer cette mesure ?')) return;
    try {
      await API.body.removeMeasurement(id);
      showToast(`${agogeIcon('trash')} Mesure supprimée`);
      render();
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  // ---------- MODAL HELPERS ----------
  function showModal(html) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-sheet">${html}</div>
    </div>`;
  }

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerHTML = window.agogeToastMarkup(msg);
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2500);
  }

  return {
    render,
    addWeight,
    removeWeight,
    uploadPhoto,
    handlePhotoUpload,
    removePhoto,
    comparePhotos,
    doCompare,
    measurementModal,
    saveMeasurement,
    removeMeasurement
  };
})();

window.BodyPage = BodyPage;
