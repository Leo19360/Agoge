(function(){})(); // dummy to keep file header spacing
// Calorie Calculator component
// Expose window.CalorieCalculator to render a reusable calculator UI.
// Usage:
//   CalorieCalculator.showModal({ onUse: (kcal) => { /* use kcal */ } })
//   or
//   const c = new CalorieCalculator(containerElement, options)
(function () {
  function formatInt(v) { return Math.round(v || 0); }

  function computeBMR({ sex, weight, height, age }) {
    weight = Number(weight) || 0;
    height = Number(height) || 0;
    age = Number(age) || 0;
    if (sex === 'male') return 10 * weight + 6.25 * height - 5 * age + 5;
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }

  function activityFactor(key) {
    const map = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      very: 1.725,
      extreme: 1.9
    };
    return map[key] || 1.2;
  }

  function createMarkup(state) {
    return `
      <div class="calcalc">
        <div class="modal-field">
          <label>Sexe</label>
          <select id="cc-sex">
            <option value="male">Homme</option>
            <option value="female">Femme</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Poids (kg)</label>
          <input type="number" id="cc-weight" min="1" step="0.1" value="${state.weight || ''}">
        </div>
        <div class="modal-field">
          <label>Taille (cm)</label>
          <input type="number" id="cc-height" min="50" step="1" value="${state.height || ''}">
        </div>
        <div class="modal-field">
          <label>Âge</label>
          <input type="number" id="cc-age" min="1" step="1" value="${state.age || ''}">
        </div>
        <div class="modal-field">
          <label>Niveau d'activité</label>
          <select id="cc-activity">
            <option value="sedentary">Sédentaire (peu ou pas de sport)</option>
            <option value="light">Légèrement actif (1-3x / semaine)</option>
            <option value="moderate">Modérément actif (3-5x / semaine)</option>
            <option value="very">Très actif (6-7x / semaine)</option>
            <option value="extreme">Extrêmement actif (sport intense + travail physique)</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Objectif</label>
          <select id="cc-goal">
            <option value="maintien">Maintien</option>
            <option value="prise">Prise de masse</option>
            <option value="seche">Sèche</option>
          </select>
        </div>

        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary" id="cc-calc">Calculer</button>
          <button class="btn btn-outline" id="cc-reset">Réinitialiser</button>
        </div>

        <div id="cc-result" style="margin-top:12px"></div>

        <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary" id="cc-use" disabled>Utiliser ce résultat</button>
          <button class="btn btn-outline" id="cc-manual-toggle">Je préfère fixer mon objectif</button>
        </div>

        <div id="cc-manual" style="margin-top:10px;display:none">
          <div class="modal-field">
            <label>Calories journalières (manuel)</label>
            <input type="number" id="cc-manual-val" min="0">
            <div id="cc-manual-warning" style="font-size:12px;color:var(--danger);display:none;margin-top:6px"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-primary" id="cc-manual-use">Appliquer la valeur</button>
          </div>
        </div>

        <div style="font-size:12px;color:var(--text-dim);margin-top:10px">Ces valeurs sont des estimations à titre indicatif, elles ne remplacent pas l'avis d'un professionnel de santé.</div>
      </div>
    `;
  }

  function bindHandlers(rootEl, opts) {
    const get = (id) => rootEl.querySelector(id);
    function computeMacros(totalCalories, weightKg, goal) {
      totalCalories = Number(totalCalories) || 0;
      weightKg = Number(weightKg) || 0;
      // Proteines
      let proteinPerKg = 1.8;
      if (goal === 'seche') proteinPerKg = 2.2;
      if (goal === 'prise') proteinPerKg = 1.8;
      const proteinsG = Math.round(proteinPerKg * weightKg);
      const proteinsKcal = proteinsG * 4;
      // Lipides: 27.5%
      const fatsKcal = Math.round(totalCalories * 0.275);
      const fatsG = Math.round(fatsKcal / 9);
      // Glucides: reste
      const carbsKcal = totalCalories - proteinsKcal - fatsKcal;
      const carbsG = Math.round(Math.max(0, Math.round(carbsKcal / 4)));
      return {
        proteinsG,
        proteinsKcal,
        fatsG,
        fatsKcal,
        carbsG,
        carbsKcal
      };
    }

    function renderMacros(root, totalCalories, weightKg, goal) {
      const res = computeMacros(totalCalories, weightKg, goal);
      const rc = root.querySelector('#cc-result');
      if (!rc) return;
      if (res.carbsKcal < 0) {
        rc.innerHTML = `<div class="card"><div style="padding:10px"><div style="font-size:16px;color:var(--danger)">Vos calories sont trop basses pour cette répartition, réajustez vos apports</div></div></div>`;
        return;
      }
      // small bars showing kcal proportions
      const total = Math.max(1, Number(totalCalories));
      const pPct = Math.round((res.proteinsKcal / total) * 100);
      const fPct = Math.round((res.fatsKcal / total) * 100);
      const cPct = Math.max(0, 100 - pPct - fPct);
      rc.innerHTML = `
        <div class="card" style="padding:10px">
          <div style="font-size:18px;font-weight:600">${Math.round(total)} kcal/j</div>
          <div style="font-size:13px;color:var(--text-dim);margin-top:6px">Protéines: ${res.proteinsG} g (${res.proteinsKcal} kcal) • Lipides: ${res.fatsG} g (${res.fatsKcal} kcal) • Glucides: ${res.carbsG} g (${Math.round(res.carbsKcal)} kcal)</div>
          <div style="display:flex;gap:6px;margin-top:8px;align-items:center">
            <div style="flex:1;background:var(--bg-input);height:12px;border-radius:8px;overflow:hidden;display:flex">
              <div style="width:${pPct}%;background:#4caf50"></div>
              <div style="width:${fPct}%;background:#ff9800"></div>
              <div style="width:${cPct}%;background:#2196f3"></div>
            </div>
            <div style="min-width:120px;text-align:right;font-size:12px;color:var(--text-dim)">${pPct}% / ${fPct}% / ${cPct}%</div>
          </div>
        </div>
      `;
    }

    const updateResult = () => {
      const sex = get('#cc-sex').value;
      const weight = parseFloat(get('#cc-weight').value) || 0;
      const height = parseFloat(get('#cc-height').value) || 0;
      const age = parseInt(get('#cc-age').value, 10) || 0;
      const activity = get('#cc-activity').value;
      const goalSel = get('#cc-goal').value;
      if (!(weight > 0 && height > 0 && age > 0)) {
        get('#cc-result').innerHTML = '<div class="card-subtitle">Remplis poids, taille et âge pour calculer.</div>';
        get('#cc-use').disabled = true;
        return null;
      }
      const bmr = computeBMR({ sex, weight, height, age });
      const tdee = bmr * activityFactor(activity);
      let adjusted = tdee;
      if (goalSel === 'prise') adjusted = tdee * 1.15;
      if (goalSel === 'seche') adjusted = tdee * 0.8;
      const rounded = Math.round(adjusted);
      // render macros as well
      renderMacros(rootEl, rounded, weight, goalSel);
      get('#cc-use').disabled = false;
      return rounded;
    };

    rootEl.addEventListener('input', (ev) => {
      if (ev.target && (ev.target.id === 'cc-weight' || ev.target.id === 'cc-height' || ev.target.id === 'cc-age' || ev.target.id === 'cc-sex' || ev.target.id === 'cc-activity' || ev.target.id === 'cc-goal')) {
        updateResult();
      }
    });

    // recalculer les macros en cas de saisie manuelle des calories
    get('#cc-manual-val').addEventListener('input', (ev) => {
      const mv = parseInt(ev.target.value, 10);
      const warn = get('#cc-manual-warning');
      if (isNaN(mv) || mv <= 0) { warn.style.display = 'block'; warn.textContent = 'Valeur invalide'; return; }
      if (mv < 800) { warn.style.display = 'block'; warn.textContent = 'Vos calories sont très basses'; }
      else if (mv > 6000) { warn.style.display = 'block'; warn.textContent = 'Valeur trop élevée'; }
      else { warn.style.display = 'none'; }
      // use current weight and goal to render
      const weight = parseFloat(get('#cc-weight').value) || 0;
      const goalSel = get('#cc-goal').value;
      renderMacros(rootEl, mv, weight, goalSel);
    });

    get('#cc-calc').addEventListener('click', () => updateResult());
    get('#cc-reset').addEventListener('click', () => {
      get('#cc-weight').value = '';
      get('#cc-height').value = '';
      get('#cc-age').value = '';
      get('#cc-result').innerHTML = '';
      get('#cc-use').disabled = true;
      get('#cc-manual').style.display = 'none';
    });

    get('#cc-use').addEventListener('click', () => {
      const val = updateResult();
      if (val && opts && typeof opts.onUse === 'function') {
        const weight = parseFloat(get('#cc-weight').value) || 0;
        const goalSel = get('#cc-goal').value;
        const macros = computeMacros(val, weight, goalSel);
        opts.onUse(val, { macros });
      }
    });

    get('#cc-manual-toggle').addEventListener('click', () => {
      const manual = get('#cc-manual');
      manual.style.display = manual.style.display === 'none' ? 'block' : 'none';
    });

    get('#cc-manual-use').addEventListener('click', () => {
      const mv = parseInt(get('#cc-manual-val').value, 10);
      const warn = get('#cc-manual-warning');
      if (!mv || isNaN(mv)) { warn.style.display = 'block'; warn.textContent = 'Valeur invalide'; return; }
      if (mv < 800 || mv > 6000) { warn.style.display = 'block'; warn.textContent = 'Veuillez choisir une valeur entre 800 et 6000 kcal'; return; }
      warn.style.display = 'none';
      if (opts && typeof opts.onUse === 'function') {
        const weight = parseFloat(get('#cc-weight').value) || 0;
        const goalSel = get('#cc-goal').value;
        const macros = computeMacros(mv, weight, goalSel);
        opts.onUse(mv, { manual: true, macros });
      }
    });
  }

  // Ensure a global closeModal exists (do not overwrite if present)
  if (!window.closeModal) {
    window.closeModal = function () {
      const root = document.getElementById('modal-root');
      if (root) root.innerHTML = '';
    };
  }

  // local showModal implementation (no dependency on page-specific showModal)
  function localShowModal(html) {
    const root = document.getElementById('modal-root');
    if (!root) return;
    root.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-sheet">${html}</div>
    </div>`;
    return root.querySelector('.modal-sheet');
  }

  // Public API: show modal with calculator
  window.CalorieCalculator = {
    showModal: function (opts) {
      opts = opts || {};
      const state = opts.state || {};
      const sheet = localShowModal(`<h3>Calculateur calorique <button class="modal-close" onclick="closeModal()">✕</button></h3>` + createMarkup(state));
      if (sheet) bindHandlers(sheet, opts);
    }
  };
})();
