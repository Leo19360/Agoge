/* ============================================
   AGOGE - Page Alimentation
   ============================================ */
const NutritionPage = (() => {
  let selectedDate = new Date().toISOString().slice(0, 10);
  let searchResults = [];
  let currentData = null;
  let currentFood = null;      // produit en cours d'affichage (détail)
  let scannerStream = null;    // flux caméra du scan code-barres
  let scannerStopped = false;
  let searchRequestId = 0;

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function goalStatus(value, goal) {
    if (!goal || goal <= 0) return { cls: '', label: '' };
    const ratio = value / goal;
    if (ratio < 0.9) return { cls: 'goal-under', label: "Sous l'objectif" };
    if (ratio <= 1.0) return { cls: 'goal-ok', label: 'Objectif atteint ✓' };
    if (ratio <= 1.15) return { cls: 'goal-warning', label: 'Légèrement dépassé' };
    return { cls: 'goal-over', label: 'Très dépassé' };
  }

  function colorFor(value, goal) {
    return goalStatus(value, goal).cls;
  }

  async function render() {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
      const data = await API.nutrition.entries(selectedDate);
      currentData = data;
      const { entries, totals, goal } = data;

      const calStatus = goalStatus(totals.calories, goal?.calories);
      const protStatus = goalStatus(totals.proteins, goal?.proteins);
      const carbStatus = goalStatus(totals.carbs, goal?.carbs);
      const fatStatus = goalStatus(totals.fats, goal?.fats);

      const entriesHtml = entries.length ? entries.map((e) => `
        <div class="food-entry">
          <div>
            <div class="fe-name">${e.food_name}</div>
            <div class="fe-macros">${Math.round(e.quantity)}${e.unit} • ${Math.round(e.calories)} kcal • P ${Math.round(e.proteins)}g • G ${Math.round(e.carbs)}g • L ${Math.round(e.fats)}g</div>
          </div>
          <button class="fe-del" onclick="NutritionPage.removeEntry(${e.id})">✕</button>
        </div>
      `).join('') : '<div class="empty-state">Rien pour l\'instant. Recherche un aliment ci-dessus pour commencer ton journal alimentaire 🍎</div>';

      container.innerHTML = `
        <div class="page-title">🥗 Alimentation</div>
        <div class="page-subtitle">Suis tes calories et tes macros chaque jour</div>

        <div class="hero-card">
          <div class="hero-title">Journal du jour</div>
          <div class="hero-subtitle">Ajoute rapidement tes aliments et garde un œil sur tes objectifs.</div>
          <div class="summary-pills">
            <span class="summary-pill">🔥 ${Math.round(totals.calories)} kcal</span>
            <span class="summary-pill">💪 ${Math.round(totals.proteins)}g prot</span>
            <span class="summary-pill">🍞 ${Math.round(totals.carbs)}g glucides</span>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">📅 Jour</div>
              <div class="card-subtitle">Choisis la date</div>
            </div>
            <input type="date" value="${selectedDate}" onchange="NutritionPage.setDate(this.value)" style="padding:8px;background:var(--bg-input);border:1px solid #333;border-radius:8px;color:var(--text);font-size:13px">
          </div>
          <div class="search-bar">
            <input type="text" id="food-search" placeholder="Rechercher un aliment (ex: poulet, riz...)" onkeydown="if(event.key==='Enter')NutritionPage.search()">
            <button class="btn btn-outline" title="Scanner un code-barres" onclick="NutritionPage.scanBarcode()">📷</button>
            <button class="btn btn-primary" onclick="NutritionPage.search()">🔍</button>
          </div>
          <div id="food-results"></div>
        </div>

        <div class="section-title" style="margin-top:16px">Totaux du jour</div>
        <div class="nutri-total">
          <div class="nutri-box">
            <div class="n-value ${colorFor(totals.calories, goal?.calories)}">${Math.round(totals.calories)}</div>
            <div class="n-label">Calories</div>
            <div class="n-goal">/ ${goal ? Math.round(goal.calories) : '—'}</div>
          </div>
          <div class="nutri-box">
            <div class="n-value ${colorFor(totals.proteins, goal?.proteins)}">${Math.round(totals.proteins)}</div>
            <div class="n-label">Protéines</div>
            <div class="n-goal">/ ${goal ? Math.round(goal.proteins) : '—'}g</div>
          </div>
          <div class="nutri-box">
            <div class="n-value ${colorFor(totals.carbs, goal?.carbs)}">${Math.round(totals.carbs)}</div>
            <div class="n-label">Glucides</div>
            <div class="n-goal">/ ${goal ? Math.round(goal.carbs) : '—'}g</div>
          </div>
          <div class="nutri-box">
            <div class="n-value ${colorFor(totals.fats, goal?.fats)}">${Math.round(totals.fats)}</div>
            <div class="n-label">Lipides</div>
            <div class="n-goal">/ ${goal ? Math.round(goal.fats) : '—'}g</div>
          </div>
        </div>

        ${goal ? `
          <div class="card">
            <div class="card-title" style="font-size:14px">Statut objectifs</div>
            <div style="margin-top:8px;font-size:13px">
              <div class="macro-row"><span style="font-size:12px">🔥 Calories : <b class="${calStatus.cls}">${calStatus.label}</b></span></div>
              <div class="macro-row"><span style="font-size:12px">💪 Protéines : <b class="${protStatus.cls}">${protStatus.label}</b></span></div>
              <div class="macro-row"><span style="font-size:12px">🍞 Glucides : <b class="${carbStatus.cls}">${carbStatus.label}</b></span></div>
              <div class="macro-row"><span style="font-size:12px">🥑 Lipides : <b class="${fatStatus.cls}">${fatStatus.label}</b></span></div>
            </div>
          </div>
        ` : ''}

        <div class="card">
          <div class="card-header">
            <div class="card-title">📋 Aliments du jour</div>
            <button class="btn btn-sm btn-outline" onclick="NutritionPage.goalModal()">🎯 Objectifs</button>
          </div>
          ${entriesHtml}
        </div>

        ${await statsHtml()}

        <div style="height:24px"></div>
      `;
    } catch (e) {
      container.innerHTML = `
        <div class="card">
          <div class="card-title" style="color:var(--danger)">⚠️ Erreur</div>
          <p class="card-subtitle">${e.message}</p>
        </div>
      `;
    }
  }

  async function statsHtml() {
    try {
      const stats = await API.nutrition.stats();
      return `
        <div class="section-title">📊 Moyenne sur 7 jours</div>
        <div class="card">
          <div class="week-avg">
            <div class="avg-box">
              <div class="avg-value">${Math.round(stats.averages.calories)}</div>
              <div class="avg-label">Kcal</div>
            </div>
            <div class="avg-box">
              <div class="avg-value">${Math.round(stats.averages.proteins)}g</div>
              <div class="avg-label">Protéines</div>
            </div>
            <div class="avg-box">
              <div class="avg-value">${Math.round(stats.averages.carbs)}g</div>
              <div class="avg-label">Glucides</div>
            </div>
            <div class="avg-box">
              <div class="avg-value">${Math.round(stats.averages.fats)}g</div>
              <div class="avg-label">Lipides</div>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:10px;text-align:center">
            Basé sur ${stats.averages.tracked_days} jour(s) suivi(s) sur 7
          </div>
        </div>
      `;
    } catch (e) {
      return '<div class="section-title">📊 Moyenne sur 7 jours</div><div class="card"><p class="card-subtitle">Disponible hors-ligne après chargement.</p></div>';
    }
  }

  function setDate(date) {
    selectedDate = date;
    render();
  }

  // ---------- RECHERCHE OPENFOODFACTS ----------
  function nutriscoreBadge(grade) {
    if (!grade) return '';
    const g = grade.toUpperCase();
    const labels = { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' };
    if (!labels[g]) return '';
    return `<span class="nutriscore nutriscore-${g.toLowerCase()}" title="Nutri-Score ${g}">${g}</span>`;
  }

  function macroLine(food) {
    const per = food.liquid ? '100 ml' : '100 g';
    return `${Math.round(food.calories)} kcal • P ${food.proteins}g • G ${food.carbs}g • L ${food.fats}g / ${per}`;
  }

  function foodResultHtml(r, i) {
    const img = r.image
      ? `<img src="${r.image}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="f-thumb f-thumb-placeholder">🍽️</div>`;
    return `
      <div class="food-result" onclick="NutritionPage.showFoodDetail(${i})">
        <div class="f-thumb">${img}</div>
        <div class="f-info">
          <div class="f-name">${r.name} ${nutriscoreBadge(r.nutriscore)}</div>
          ${r.brands ? `<div class="f-brand">${r.brands}</div>` : ''}
          <div class="f-nutri">${macroLine(r)}</div>
        </div>
        <button class="f-add" title="Voir le détail">›</button>
      </div>
    `;
  }

  async function search() {
    const input = document.getElementById('food-search');
    const query = input.value.trim();
    if (!query) return;
    const resultsDiv = document.getElementById('food-results');
    const requestId = ++searchRequestId;
    resultsDiv.innerHTML = '<div class="empty-state">🔎 Recherche en cours…</div>';
    try {
      searchResults = await API.searchFood(query);
      if (requestId !== searchRequestId) return;
      resultsDiv.innerHTML = searchResults.length
        ? searchResults.map(foodResultHtml).join('')
        : '<div class="empty-state">Aucun résultat pour cette recherche.</div>';
    } catch (e) {
      if (requestId !== searchRequestId) return;
      resultsDiv.innerHTML = '<div class="empty-state">⚠️ Recherche impossible pour l’instant. Réessaie dans quelques secondes.</div>';
    }
  }

  // ---------- DÉTAIL PRODUIT ----------
  async function showFoodDetail(index) {
    const food = searchResults[index];
    if (!food) return;
    if (!food.ingredients && !food.nutriscore && !food.fibers && !food.image) {
      // Détail incomplet dans la recherche -> on recharge via le barcode
      try {
        const detail = await API.getFood(food.id);
        searchResults[index] = { ...food, ...detail };
        currentFood = searchResults[index];
      } catch (e) {
        currentFood = food;
      }
    } else {
      currentFood = food;
    }
    renderFoodModal(currentFood);
  }

  function renderFoodModal(food) {
    const img = food.image
      ? `<img src="${food.image}" alt="${food.name}" class="f-detail-img" onerror="this.style.display='none'">`
      : `<div class="f-detail-img f-detail-img-placeholder">🍽️</div>`;
    const per = food.liquid ? '100 ml' : '100 g';
    const novaLabel = food.nova ? `• NOVA ${food.nova}` : '';

    const macroCell = (icon, label, value, unit) => `
      <div class="f-macro">
        <div class="f-macro-icon">${icon}</div>
        <div class="f-macro-value">${value}${unit}</div>
        <div class="f-macro-label">${label}</div>
      </div>
    `;

    showModal(`
      <h3>Détail du produit <button class="modal-close" onclick="closeModal()">✕</button></h3>
      <div class="f-detail">
        ${img}
        <div class="f-detail-title">${food.name} ${nutriscoreBadge(food.nutriscore)}</div>
        ${food.brands ? `<div class="f-detail-brand">${food.brands}${novaLabel}</div>` : `<div class="f-detail-brand">${novaLabel}</div>`}
        ${food.quantity ? `<div class="f-detail-qty">Conditionnement : ${food.quantity}</div>` : ''}
      </div>

      <div class="section-title" style="font-size:14px;margin:14px 0 8px">Valeurs nutritionnelles (${per})</div>
      <div class="f-macro-grid">
        ${macroCell('🔥', 'Calories', Math.round(food.calories), ' kcal')}
        ${macroCell('💪', 'Protéines', food.proteins, 'g')}
        ${macroCell('🍞', 'Glucides', food.carbs, 'g')}
        ${macroCell('🥑', 'Lipides', food.fats, 'g')}
        ${macroCell('🌾', 'Fibres', food.fibers || 0, 'g')}
        ${macroCell('🍬', 'Sucres', food.sugars || 0, 'g')}
        ${macroCell('🧂', 'Sel', food.salt || 0, 'g')}
      </div>

      ${food.ingredients ? `
        <div class="section-title" style="font-size:14px;margin:14px 0 8px">Ingrédients</div>
        <p class="f-ingredients">${food.ingredients}</p>
      ` : ''}

      ${food.allergens ? `
        <div class="f-allergens">⚠️ Allergènes : ${food.allergens.replace(/\s*en:/g, '').replace(/,/g, ', ')}</div>
      ` : ''}

      <div class="section-title" style="font-size:14px;margin:16px 0 8px">Ajouter au repas</div>
      <div class="f-add-row">
        <div class="modal-field" style="flex:1;margin-bottom:0">
          <label>Quantité</label>
          <input type="number" id="food-qty" value="100" min="1" step="10">
        </div>
        <div class="modal-field" style="margin-bottom:0">
          <label>Unité</label>
          <select id="food-unit">
            <option value="g" ${food.liquid ? '' : 'selected'}>g</option>
            <option value="ml" ${food.liquid ? 'selected' : ''}>ml</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-block" onclick="NutritionPage.confirmAddFood()">✅ Ajouter</button>
    `);
  }

  async function confirmAddFood() {
    const food = currentFood;
    if (!food) return;
    const qty = parseFloat(document.getElementById('food-qty').value) || 100;
    const unit = document.getElementById('food-unit').value || (food.liquid ? 'ml' : 'g');
    const ratio = qty / 100;
    closeModal();
    try {
      await API.nutrition.addEntry({
        date: selectedDate,
        food_name: food.name,
        quantity: qty,
        unit,
        calories: food.calories * ratio,
        proteins: food.proteins * ratio,
        carbs: food.carbs * ratio,
        fats: food.fats * ratio
      });
      showToast('✅ Aliment ajouté');
      render();
    } catch (e) {
      showToast('⚠️ ' + e.message);
    }
  }

  // ---------- SCAN CODE-BARRES ----------
  async function scanBarcode() {
    if (!('BarcodeDetector' in window)) {
      manualBarcodeModal();
      return;
    }
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    scannerStopped = false;
    scannerStream = null;

    showModal(`
      <h3>📷 Scanner un code-barres <button class="modal-close" onclick="NutritionPage.stopScanner()">✕</button></h3>
      <div class="scanner-wrap">
        <video id="scanner-video" class="scanner-video" playsinline muted></video>
        <div class="scanner-overlay">
          <div class="scanner-frame"></div>
          <p class="scanner-hint">Place le code-barres dans le cadre</p>
        </div>
      </div>
      <button class="btn btn-outline btn-block" onclick="NutritionPage.manualBarcodeModal()">⌨️ Saisir le code manuellement</button>
    `);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (scannerStopped) return;
      scannerStream = stream;
      const video = document.getElementById('scanner-video');
      video.srcObject = stream;
      await video.play();

      const tick = async () => {
        if (scannerStopped) return;
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length > 0) {
            const code = codes[0].rawValue;
            stopScanner();
            loadScannedProduct(code);
            return;
          }
        } catch (e) { /* pas de détection à ce frame */ }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      if (!scannerStopped) {
        stopScanner();
        manualBarcodeModal('📷 Caméra indisponible — saisis le code manuellement.');
      }
    }
  }

  function stopScanner() {
    scannerStopped = true;
    if (scannerStream) {
      scannerStream.getTracks().forEach((t) => t.stop());
      scannerStream = null;
    }
    const root = document.getElementById('modal-root');
    if (root && root.querySelector('.scanner-video')) root.innerHTML = '';
  }

  async function loadScannedProduct(barcode) {
    const b = String(barcode).trim();
    if (!b) return;
    showModal('<h3>Chargement du produit...</h3><div class="loading">Recherche du produit...</div>');
    try {
      const food = await API.getFood(b);
      currentFood = food;
      renderFoodModal(food);
    } catch (e) {
      showModal(`
        <h3>Produit introuvable <button class="modal-close" onclick="closeModal()">✕</button></h3>
        <p class="card-subtitle">Le produit ${b} n'existe pas dans Open Food Facts.</p>
        <button class="btn btn-primary btn-block" onclick="NutritionPage.manualBarcodeModal()">⌨️ Réessayer manuellement</button>
      `);
    }
  }

  function manualBarcodeModal(msg) {
    showModal(`
      <h3>⌨️ Saisie du code-barres <button class="modal-close" onclick="closeModal()">✕</button></h3>
      ${msg ? `<p class="card-subtitle" style="margin-bottom:10px">${msg}</p>` : ''}
      <div class="modal-field">
        <label>Code-barres du produit</label>
        <input type="text" id="manual-barcode" inputmode="numeric" placeholder="Ex : 3017620422003" onkeydown="if(event.key==='Enter')NutritionPage.loadScannedProduct(document.getElementById('manual-barcode').value)">
      </div>
      <button class="btn btn-primary btn-block" onclick="NutritionPage.loadScannedProduct(document.getElementById('manual-barcode').value)">🔍 Rechercher</button>
    `);
  }

  async function removeEntry(id) {
    try {
      await API.nutrition.removeEntry(id);
      showToast('🗑️ Aliment retiré');
      render();
    } catch (e) {
      showToast('⚠️ ' + e.message);
    }
  }

  // ---------- OBJECTIFS ----------
  function goalModal() {
    const goal = currentData?.goal || {};
    showModal(`
      <h3>Objectifs nutritionnels <button class="modal-close" onclick="closeModal()">✕</button></h3>
      <div class="modal-field">
        <label>🔥 Calories (kcal)</label>
        <input type="number" id="goal-calories" value="${goal.calories || 2000}" min="0">
      </div>
      <div class="modal-field">
        <label>💪 Protéines (g)</label>
        <input type="number" id="goal-proteins" value="${goal.proteins || 150}" min="0">
      </div>
      <div class="modal-field">
        <label>🍞 Glucides (g)</label>
        <input type="number" id="goal-carbs" value="${goal.carbs || 250}" min="0">
      </div>
      <div class="modal-field">
        <label>🥑 Lipides (g)</label>
        <input type="number" id="goal-fats" value="${goal.fats || 70}" min="0">
      </div>
      <button class="btn btn-primary btn-block" onclick="NutritionPage.saveGoals()">💾 Enregistrer</button>
    `);
  }

  async function saveGoals() {
    const data = {
      calories: parseFloat(document.getElementById('goal-calories').value) || 0,
      proteins: parseFloat(document.getElementById('goal-proteins').value) || 0,
      carbs: parseFloat(document.getElementById('goal-carbs').value) || 0,
      fats: parseFloat(document.getElementById('goal-fats').value) || 0
    };
    try {
      await API.nutrition.setGoals(data);
      closeModal();
      showToast('🎯 Objectifs enregistrés');
      render();
    } catch (e) {
      showToast('⚠️ ' + e.message);
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
    // Arrête le scanner caméra s'il est actif (fonction hoistée)
    if (scannerStream || scannerStopped === false) stopScanner();
    document.getElementById('modal-root').innerHTML = '';
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2500);
  }

  // Expose closeModal globalement (utilisé par les handlers inline des modales)
  window.closeModal = closeModal;

  return {
    render,
    setDate,
    search,
    showFoodDetail,
    confirmAddFood,
    removeEntry,
    scanBarcode,
    stopScanner,
    loadScannedProduct,
    manualBarcodeModal,
    goalModal,
    saveGoals
  };
})();

window.NutritionPage = NutritionPage;
