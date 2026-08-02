/* ============================================
   AGOGE - Page Séances (programmes permanents)
   ============================================ */
const SessionsPage = (() => {
  let currentProgram = null;   // programme affiché en mode "entraînement"
  let currentSetId = null;     // série active (pill sélectionnée)
  let restTimer = null;
  let restInterval = null;
  let restRemaining = 0;
  let restExerciseName = '';

  const MUSCLE_GROUPS = [
    'Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps',
    'Quadriceps', 'Ischio-jambiers', 'Mollets', 'Abdominaux', 'Fessiers', 'Avant-bras'
  ];

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function fmtDate(d) {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '<').replace(/>/g, '>')
      .replace(/"/g, '"').replace(/'/g, '&#39;');
  }

  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // ---------- LISTE : programmes + historique ----------
  async function renderList() {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="loading">Chargement...</div>';
    try {
      const all = await API.sessions.list();
      const programs = all.filter((s) => Number(s.is_template) === 1);
      const history = all.filter((s) => Number(s.is_template) === 0);

      const programItems = programs.length ? programs.map((s) => `
        <div class="program-card" onclick="SessionsPage.open(${s.id})">
          <div class="program-card-header">
            <div class="program-name">${escapeHtml(s.name)}</div>
            <div class="program-progress">${s.done_exercises || 0}/${s.nb_exercises || 0}</div>
          </div>
          <div class="program-bar"><div class="program-bar-fill" style="width:${progPct(s)}%"></div></div>
          <div class="program-meta">${s.nb_exercises || 0} exercices • ${s.nb_sets || 0} séries</div>
          <div class="quick-actions" style="margin-top:10px">
            <button class="quick-action" onclick="event.stopPropagation(); SessionsPage.open(${s.id})">${agogeIcon('play')} Ouvrir</button>
            <button class="quick-action" onclick="event.stopPropagation(); SessionsPage.editProgram(${s.id})">${agogeIcon('edit')} Modifier</button>
            <button class="quick-action" onclick="event.stopPropagation(); SessionsPage.deleteProgram(${s.id})">${agogeIcon('trash')} Supprimer</button>
            <button class="quick-action" onclick="event.stopPropagation(); SessionsPage.completeProgramFromList(${s.id})">${agogeIcon('check')} Terminer</button>
          </div>
        </div>
      `).join('') : `<div class="empty-state">Aucun programme pour le moment. Crée ton premier programme permanent et commence dès aujourd'hui ${agogeIcon('dumbbell')}</div>`;

      const historyItems = history.length ? history.map((s) => `
        <div class="session-list-item" onclick="SessionsPage.openHistory(${s.id})">
          <div>
            <div class="s-name">${escapeHtml(s.name)}</div>
            <div class="s-meta">${fmtDate(s.date)} • ${s.nb_exercises || 0} exercices • ${s.nb_sets || 0} séries</div>
          </div>
          <span class="s-arrow">›</span>
        </div>
      `).join('') : '<div class="empty-state">Aucune séance terminée pour le moment. Quand tu auras fini une session, elle apparaîtra ici.</div>';

      container.innerHTML = `
        <div class="page-title">${agogeIcon('dumbbell')} Séances</div>
        <div class="page-subtitle">Tes programmes permanents, réutilisables sans te compliquer la vie.</div>

        <div class="hero-card">
          <div class="hero-title">Routine simple</div>
          <div class="hero-subtitle">Crée un programme, coche tes exercices au fil de la séance et termine proprement quand tu as fini.</div>
          <div class="quick-actions">
            <button class="quick-action" onclick="SessionsPage.createModal()">${agogeIcon('gym')} Nouveau programme</button>
            <button class="quick-action" onclick="SessionsPage.renderList()">${agogeIcon('arrowsRotate')} Actualiser</button>
          </div>
        </div>

        <button class="btn btn-primary btn-block btn-lg" onclick="SessionsPage.createModal()">
          ${agogeIcon('gym')} Créer un programme
        </button>

        <div class="section-title">${agogeIcon('clipboard')} Mes programmes</div>
        ${programItems}

        <div class="section-title">${agogeIcon('list')} Historique</div>
        ${historyItems}

        <div style="height:24px"></div>
      `;
    } catch (e) {
      container.innerHTML = `
        <div class="card">
          <div class="card-title" style="color:var(--danger)">${agogeIcon('warning')} Erreur</div>
          <p class="card-subtitle">${escapeHtml(e.message)}</p>
        </div>
      `;
    }
  }

  function progPct(s) {
    if (!s || !s.nb_exercises) return 0;
    return Math.round((s.done_exercises || 0) / s.nb_exercises * 100);
  }

  // ---------- DÉTAIL / ENTRAÎNEMENT ----------
  async function open(id) {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="loading">Chargement...</div>';
    const session = await API.sessions.get(id);
    currentProgram = session;
    currentSetId = null;
    stopRest();
    renderWorkout();
  }

  async function openHistory(id) {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="loading">Chargement...</div>';
    const session = await API.sessions.get(id);
    currentProgram = session;
    currentSetId = null;
    stopRest();

    const groups = groupExercises(session.exercises);
    const groupsHtml = groups.map((g) => `
      <div class="muscle-section">
        <div class="muscle-header">${escapeHtml(g.name)}</div>
        ${g.items.map(exHtml).join('')}
      </div>
    `).join('');

    container.innerHTML = `
      <button class="btn btn-sm btn-outline" onclick="SessionsPage.renderList()">← Retour</button>
      <div style="height:12px"></div>
      <div class="page-title">${escapeHtml(session.name)}</div>
      <div class="page-subtitle">Séance du ${fmtDate(session.date)} • ${session.done_exercises}/${session.total_exercises} exercices</div>

      ${groupsHtml}

      <div style="height:24px"></div>
    `;
  }

  function groupExercises(exercises) {
    const map = new Map();
    for (const ex of exercises) {
      const key = ex.muscle_group || 'Autres';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ex);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }

  function maxWeight(ex) {
    if (!ex.sets || !ex.sets.length) return 0;
    return Math.max(...ex.sets.map((s) => num(s.weight)));
  }

  function targetText(ex) {
    // Objectif prévu : ex "2x 6-8 reps + 1x 12 reps"
    if (ex.sets && ex.sets.length) {
      const parts = ex.sets.map((s, i) => {
        return `S${s.set_number} ${formatSetTarget(s)}`;
      });
      return parts.join(' + ');
    }
    return '';
  }

  function formatSetTarget(set) {
    const reps = set.target_reps || '';
    const weight = set.target_weight !== undefined && set.target_weight !== null && set.target_weight !== ''
      ? num(set.target_weight)
      : null;

    if (reps && weight !== null && weight > 0) return `${reps}x ${weight}kg`;
    if (reps) return `${reps} reps`;
    if (weight !== null && weight > 0) return `${weight}kg`;
    return '—';
  }

  function setPillLabel(set) {
    if (set.reps > 0 || set.weight > 0) {
      return `${set.reps || '—'}x ${num(set.weight)}kg`;
    }
    return formatSetTarget(set);
  }

  function exHtml(ex) {
    const done = Number(ex.done) === 1;
    const max = maxWeight(ex);
    const target = targetText(ex);
    const pills = ex.sets.map((s) => `
      <button class="set-pill ${s.done ? 'pill-done' : ''} ${currentSetId === s.id ? 'pill-active' : ''}"
              onclick="SessionsPage.selectSet(${s.id})">
        S${s.set_number}<span class="pill-val">${setPillLabel(s)}</span>
      </button>
    `).join('');

    return `
      <div class="exercise-card ${done ? 'ex-done' : ''}" id="ex-${ex.id}">
        <div class="ex-row">
          <label class="ex-check">
            <input type="checkbox" ${done ? 'checked' : ''} onchange="SessionsPage.toggleExercise(${ex.id}, this.checked)">
            <span class="ex-checkmark"></span>
          </label>
          <div class="ex-info">
            <div class="ex-name">${escapeHtml(ex.name)}</div>
            <div class="ex-target">${escapeHtml(target)}</div>
          </div>
          ${max > 0 ? `<div class="ex-max" title="Charge max soulevée">MAX ${num(max)}</div>` : ''}
        </div>
        <div class="ex-actions">
          <button class="btn btn-sm btn-outline" onclick="SessionsPage.weightModal(${ex.id}, '${escapeHtml(ex.name)}')">${agogeIcon('weightScale')} Poids</button>
          <button class="btn btn-sm btn-outline" onclick="SessionsPage.startRest(${ex.rest_seconds || 90}, '${escapeHtml(ex.name)}')">${agogeIcon('stopwatch')} Repos</button>
        </div>
        <div class="set-pills">${pills}</div>
      </div>
    `;
  }

  function renderWorkout() {
    const container = document.getElementById('view-container');
    const s = currentProgram;
    if (!s) return;

    const pct = progPct(s);
    const groups = groupExercises(s.exercises);
    const groupsHtml = groups.map((g) => `
      <div class="muscle-section">
        <div class="muscle-header">${escapeHtml(g.name)}</div>
        ${g.items.map(exHtml).join('')}
      </div>
    `).join('');

    container.innerHTML = `
      <div class="workout-topbar">
        <button class="icon-btn" title="Quitter / mettre en pause" onclick="SessionsPage.renderList()">←</button>
        <div class="workout-title">${escapeHtml(s.name)}</div>
        <div style="display:flex;gap:6px">
          <button class="icon-btn" title="Modifier le programme" onclick="SessionsPage.editProgram(${s.id})">${agogeIcon('edit')}</button>
          <button class="icon-btn" title="Supprimer le programme" onclick="SessionsPage.deleteProgram(${s.id})">${agogeIcon('trash')}</button>
          <button class="icon-btn" title="Réinitialiser la progression" onclick="SessionsPage.resetProgram()">${agogeIcon('arrowsRotate')}</button>
        </div>
      </div>

      <div class="workout-progress">
        <div class="wp-text">${s.done_exercises || 0}/${s.total_exercises || 0} exercices • ${pct}%</div>
        <div class="wp-bar"><div class="wp-bar-fill" style="width:${pct}%"></div></div>
      </div>

      ${groupsHtml}

      <button class="btn btn-success btn-block btn-lg" style="margin-top:16px" onclick="SessionsPage.completeProgram()">
        ${agogeIcon('check')} Terminer la séance
      </button>

      <div style="height:24px"></div>
    `;
  }

  // ---------- COCHER UN EXERCICE ----------
  async function toggleExercise(exId, checked) {
    try {
      await API.sessions.updateExercise(exId, { done: checked });
      if (currentProgram) {
        const ex = currentProgram.exercises.find((e) => e.id === exId);
        if (ex) ex.done = checked ? 1 : 0;
        currentProgram.done_exercises = currentProgram.exercises.filter((e) => Number(e.done)).length;
        renderWorkout();
      }
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  // ---------- SÉLECTION D'UNE SÉRIE (PILL ACTIVE) ----------
  function selectSet(setId) {
    const s = currentProgram;
    if (!s) return;
    const allSets = [];
    s.exercises.forEach((ex) => ex.sets.forEach((set) => allSets.push({ set, ex })));
    const found = allSets.find((o) => o.set.id === setId);
    if (!found) return;
    currentSetId = setId;
    showSetModal(found.set, found.ex);
  }

  function showSetModal(set, ex) {
    showModal(`
      <h3>${escapeHtml(ex.name)} — S${set.set_number} <button class="modal-close" onclick="closeModal()">✕</button></h3>
      <div class="modal-field">
        <label>Répétitions réalisées</label>
        <input type="number" id="set-reps" min="0" value="${set.reps || ''}" placeholder="${set.target_reps || ''}">
      </div>
      <div class="modal-field">
        <label>Poids (kg)</label>
        <input type="number" id="set-weight" step="0.5" min="0" value="${set.weight || ''}" placeholder="${set.target_weight || ''}">
      </div>
      <div class="modal-field">
        <label>Objectif (reps prévues)</label>
        <input type="text" id="set-target-reps" value="${set.target_reps || ''}" placeholder="8-10">
      </div>
      <button class="btn btn-primary btn-block" onclick="SessionsPage.saveSet(${set.id})">${agogeIcon('save')} Enregistrer</button>
    `);
  }

  async function saveSet(setId) {
    const reps = parseInt(document.getElementById('set-reps').value) || 0;
    const weight = parseFloat(document.getElementById('set-weight').value) || 0;
    const target_reps = document.getElementById('set-target-reps').value.trim() || null;
    try {
      await API.sessions.updateSet(setId, { reps, weight, target_reps });
      closeModal();
      await open(currentProgram.id);
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  // ---------- MODALE POIDS PAR DÉFAUT ----------
  function weightModal(exId, exName) {
    const s = currentProgram;
    if (!s) return;
    const ex = s.exercises.find((e) => e.id === exId);
    if (!ex) return;
    const current = maxWeight(ex) || (ex.sets[0] && ex.sets[0].target_weight) || '';
    showModal(`
      <h3>${agogeIcon('weightScale')} Poids par défaut <button class="modal-close" onclick="closeModal()">✕</button></h3>
      <p class="card-subtitle">${escapeHtml(exName)} — pré-remplit les prochaines séries</p>
      <div class="modal-field">
        <label>Poids (kg)</label>
        <input type="number" id="def-weight" step="0.5" min="0" value="${current}" placeholder="20">
      </div>
      <button class="btn btn-primary btn-block" onclick="SessionsPage.saveDefaultWeight(${exId})">${agogeIcon('save')} Appliquer</button>
    `);
  }

  async function saveDefaultWeight(exId) {
    const w = parseFloat(document.getElementById('def-weight').value) || 0;
    try {
      await API.sessions.updateExercise(exId, { default_weight: w });
      closeModal();
      showToast(`${agogeIcon('weightScale')} Poids appliqué aux prochaines séries`);
      await open(currentProgram.id);
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  // ---------- MODIFIER / SUPPRIMER ----------
  async function editProgram(id) {
    try {
      const program = await API.sessions.get(id);
      showModal(`
        <h3>Modifier le programme <button class="modal-close" onclick="closeModal()">✕</button></h3>
        <div class="modal-field">
          <label>Nom du programme</label>
          <input type="text" id="edit-program-name" value="${escapeHtml(program.name)}" placeholder="Nom du programme">
        </div>
        <div class="section-title" style="font-size:15px">Exercices</div>
        <div id="exercise-builder"></div>
        <button class="btn btn-outline btn-block" onclick="SessionsPage.addExerciseBuilder()">${agogeIcon('plus')} Ajouter un exercice</button>
        <div style="height:12px"></div>
        <button class="btn btn-primary btn-block" onclick="SessionsPage.saveEdit(${id})">${agogeIcon('save')} Enregistrer</button>
      `);

      const box = document.getElementById('exercise-builder');
      if (box) {
        box.innerHTML = '';
        (program.exercises || []).forEach((ex) => {
          addExerciseBuilder({
            name: ex.name,
            muscle_group: ex.muscle_group || '',
            nb_sets: ex.nb_sets || (ex.sets ? ex.sets.length : 3),
            rest_seconds: ex.rest_seconds || 90,
            target_reps: (ex.sets && ex.sets[0] && ex.sets[0].target_reps) || '',
            weight: (ex.sets && ex.sets[0] && ex.sets[0].target_weight) || 0,
            sets: (ex.sets || []).map((set) => ({
              target_reps: set.target_reps || '',
              target_weight: set.target_weight !== undefined ? set.target_weight : (set.weight || 0)
            }))
          });
        });
      }
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  async function deleteProgram(id) {
    if (!confirm('Supprimer ce programme d\'entraînement ?')) return;
    try {
      await API.sessions.remove(id);
      showToast(`${agogeIcon('trash')} Programme supprimé`);
      if (currentProgram && currentProgram.id === id) {
        currentProgram = null;
      }
      await renderList();
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  async function resetProgram() {
    if (!currentProgram) return;
    if (!confirm('Réinitialiser la progression de ce programme ?')) return;
    try {
      await API.sessions.reset(currentProgram.id);
      showToast(`${agogeIcon('arrowsRotate')} Progression réinitialisée`);
      await open(currentProgram.id);
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  async function completeProgramFromList(id) {
    try {
      const done = await API.sessions.complete(id, todayStr());
      showToast(`${agogeIcon('check')} Séance enregistrée dans l'historique !`);
      await openHistory(done.id);
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  // ---------- TERMINER ----------
  async function completeProgram() {
    if (!currentProgram) return;
    if (currentProgram.done_exercises < currentProgram.total_exercises) {
      if (!confirm('Tous les exercices ne sont pas cochés. Terminer quand même ?')) return;
    }
    try {
      const done = await API.sessions.complete(currentProgram.id, todayStr());
      showToast(`${agogeIcon('check')} Séance enregistrée dans l'historique !`);
      await openHistory(done.id);
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  // ---------- CHRONOMÈTRE DE REPOS ----------
  function startRest(seconds, exerciseName) {
    stopRest();
    restRemaining = seconds;
    restExerciseName = exerciseName;
    const overlay = document.createElement('div');
    overlay.id = 'rest-timer';
    overlay.className = 'rest-timer';
    overlay.innerHTML = `
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">${agogeIcon('stopwatch')} Repos — ${escapeHtml(exerciseName)}</div>
      <div class="timer-display">${formatTime(restRemaining)}</div>
      <div class="timer-controls">
        <button class="btn btn-sm btn-outline" onclick="SessionsPage.addRest(15)">+15s</button>
        <button class="btn btn-sm btn-outline" onclick="SessionsPage.stopRest()">${agogeIcon('close')} Arrêter</button>
        <button class="btn btn-sm btn-primary" onclick="SessionsPage.restComplete()">${agogeIcon('check')} Terminé</button>
      </div>
    `;
    document.body.appendChild(overlay);

    restInterval = setInterval(() => {
      restRemaining--;
      if (restRemaining <= 0) {
        restComplete();
        return;
      }
      updateTimerDisplay();
      if (restRemaining === 5) vibrate();
    }, 1000);
  }

  function addRest(sec) {
    restRemaining += sec;
    updateTimerDisplay();
  }

  function stopRest() {
    if (restInterval) clearInterval(restInterval);
    restInterval = null;
    const el = document.getElementById('rest-timer');
    if (el) el.remove();
  }

  function restComplete() {
    stopRest();
    vibrate();
    showToast(`${agogeIcon('stopwatch')} Repos terminé !`);
  }

  function renderTimer() {
    const el = document.getElementById('rest-timer');
    if (el) el.querySelector('.timer-display').textContent = formatTime(restRemaining);
  }

  function updateTimerDisplay() {
    renderTimer();
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function vibrate() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  // ---------- CRÉATION D'UN PROGRAMME ----------
  function createModal() {
    showModal(`
      <h3>Nouveau programme <button class="modal-close" onclick="closeModal()">✕</button></h3>
      <div class="modal-field">
        <label>Nom du programme</label>
        <input type="text" id="new-program-name" placeholder="Jambes, Push day..." value="">
      </div>
      <div class="section-title" style="font-size:15px">Exercices</div>
      <div id="exercise-builder"></div>
      <button class="btn btn-outline btn-block" onclick="SessionsPage.addExerciseBuilder()">${agogeIcon('plus')} Ajouter un exercice</button>
      <div style="height:12px"></div>
      <button class="btn btn-primary btn-block" onclick="SessionsPage.saveCreate()">${agogeIcon('check')} Créer le programme</button>
    `);
    addExerciseBuilder();
  }

  function addExerciseBuilder(data = {}) {
    const box = document.getElementById('exercise-builder');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'exercise-builder';
    const setTargets = Array.isArray(data.sets) && data.sets.length
      ? data.sets
      : [
          { target_reps: data.target_reps || '', target_weight: data.weight || '' },
          { target_reps: '', target_weight: data.weight || '' },
          { target_reps: '', target_weight: data.weight || '' }
        ];

    div.innerHTML = `
      <div class="eb-header">
        <input type="text" placeholder="Nom de l'exercice" class="eb-name" value="${escapeHtml(data.name || '')}">
        <button class="eb-remove" onclick="this.parentElement.parentElement.remove()">${agogeIcon('close')}</button>
      </div>
      <div class="eb-group">
        <select class="eb-muscle">
          <option value="">— Groupe musculaire —</option>
          ${MUSCLE_GROUPS.map((g) => `<option value="${g}" ${data.muscle_group === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="eb-sets">
        <div>
          <label>Repos</label>
          <input type="number" min="0" value="${data.rest_seconds || 90}" class="eb-rest">
        </div>
        <div>
          <label>Poids maximal</label>
          <input type="number" step="0.5" min="0" value="${data.weight || 20}" class="eb-weight-input" placeholder="20">
        </div>
      </div>
      <div class="eb-set-grid">
        <div class="eb-set-cell">
          <label>1re série</label>
          <input type="text" class="eb-set-reps" placeholder="9" value="${escapeHtml(setTargets[0] && setTargets[0].target_reps !== undefined ? setTargets[0].target_reps : '')}">
          <label>Poids de la série</label>
          <input type="number" step="0.5" min="0" class="eb-set-weight" placeholder="30" value="${escapeHtml(setTargets[0] && setTargets[0].target_weight !== undefined ? setTargets[0].target_weight : (data.weight || ''))}">
        </div>
        <div class="eb-set-cell">
          <label>2e série</label>
          <input type="text" class="eb-set-reps" placeholder="9" value="${escapeHtml(setTargets[1] && setTargets[1].target_reps !== undefined ? setTargets[1].target_reps : '')}">
          <label>Poids de la série</label>
          <input type="number" step="0.5" min="0" class="eb-set-weight" placeholder="20" value="${escapeHtml(setTargets[1] && setTargets[1].target_weight !== undefined ? setTargets[1].target_weight : (data.weight || ''))}">
        </div>
        <div class="eb-set-cell">
          <label>3e série</label>
          <input type="text" class="eb-set-reps" placeholder="12" value="${escapeHtml(setTargets[2] && setTargets[2].target_reps !== undefined ? setTargets[2].target_reps : '')}">
          <label>Poids de la série</label>
          <input type="number" step="0.5" min="0" class="eb-set-weight" placeholder="16" value="${escapeHtml(setTargets[2] && setTargets[2].target_weight !== undefined ? setTargets[2].target_weight : (data.weight || ''))}">
        </div>
      </div>
    `;
    box.appendChild(div);
  }

  function collectExerciseBuilders(selectorId) {
    const builders = document.querySelectorAll('.exercise-builder');
    const exercises = [];
    builders.forEach((b) => {
      const exName = b.querySelector('.eb-name').value.trim();
      if (!exName) return;
      const muscle_group = b.querySelector('.eb-muscle').value;
      const rest = parseInt(b.querySelector('.eb-rest').value) || 90;
      const weight = parseFloat(b.querySelector('.eb-weight-input').value) || 0;
      const setInputs = Array.from(b.querySelectorAll('.eb-set-reps'));
      const weightInputs = Array.from(b.querySelectorAll('.eb-set-weight'));
      const sets = setInputs.map((input, index) => {
        const value = input.value.trim();
        const setWeightValue = weightInputs[index] ? parseFloat(weightInputs[index].value) : NaN;
        const setWeight = Number.isFinite(setWeightValue) ? setWeightValue : weight;
        return {
          set_number: index + 1,
          target_reps: value || null,
          target_weight: setWeight || 0
        };
      }).filter((set) => set.target_reps !== null || set.target_weight > 0);

      exercises.push({
        name: exName,
        muscle_group,
        nb_sets: sets.length || 3,
        rest_seconds: rest,
        weight,
        sets: sets.length ? sets : [
          { set_number: 1, target_reps: null, target_weight: weight || 0 },
          { set_number: 2, target_reps: null, target_weight: weight || 0 },
          { set_number: 3, target_reps: null, target_weight: weight || 0 }
        ]
      });
    });
    return exercises;
  }

  async function saveCreate() {
    const name = document.getElementById('new-program-name').value.trim();
    if (!name) {
      showToast('Donne un nom au programme');
      return;
    }
    const exercises = collectExerciseBuilders();
    if (!exercises.length) {
      showToast('Ajoute au moins un exercice');
      return;
    }
    try {
      const session = await API.sessions.create({ name, exercises });
      closeModal();
      showToast(`${agogeIcon('check')} Programme créé !`);
      await open(session.id);
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  async function saveEdit(id) {
    const name = document.getElementById('edit-program-name').value.trim();
    if (!name) {
      showToast('Donne un nom au programme');
      return;
    }
    const exercises = collectExerciseBuilders();
    if (!exercises.length) {
      showToast('Ajoute au moins un exercice');
      return;
    }
    try {
      const session = await API.sessions.update(id, { name, exercises });
      closeModal();
      showToast(`${agogeIcon('check')} Programme mis à jour`);
      if (currentProgram && currentProgram.id === id) {
        await open(session.id);
      } else {
        await renderList();
      }
    } catch (e) {
      showToast(`${agogeIcon('warning')} ${e.message}`);
    }
  }

  // ---------- MODAL HELPERS ----------
  function showModal(html) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)SessionsPage.closeModal()">
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
    render: renderList,
    renderList,
    closeModal,
    open,
    openHistory,
    createModal,
    addExerciseBuilder,
    editProgram,
    deleteProgram,
    saveCreate,
    saveEdit,
    toggleExercise,
    selectSet,
    saveSet,
    weightModal,
    saveDefaultWeight,
    resetProgram,
    completeProgramFromList,
    completeProgram,
    startRest,
    addRest,
    stopRest,
    restComplete
  };
})();

window.SessionsPage = SessionsPage;
window.closeModal = function () {
  if (window.SessionsPage && typeof window.SessionsPage.closeModal === 'function') {
    window.SessionsPage.closeModal();
  }
};

