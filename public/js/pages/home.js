/* ============================================
   AGOGE - Page d'accueil
   ============================================ */
const HomePage = (() => {
  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function fmtShortDate(d) {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function goalColor(value, goal) {
    if (!goal || goal <= 0) return '';
    const ratio = value / goal;
    if (ratio < 0.9) return 'goal-under';
    if (ratio <= 1.0) return 'goal-ok';
    if (ratio <= 1.15) return 'goal-warning';
    return 'goal-over';
  }

  function macroColor(value, goal) {
    if (!goal || goal <= 0) return '';
    const ratio = value / goal;
    if (ratio < 0.9) return 'goal-under';
    if (ratio <= 1.0) return 'goal-ok';
    if (ratio <= 1.2) return 'goal-warning';
    return 'goal-over';
  }

  function macroBar(label, value, goal, cls, unit = 'g') {
    const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
    const colorCls = macroColor(value, goal);
    return `
      <div class="macro-row">
        <div class="macro-header">
          <span>${label}</span>
          <span class="${colorCls}">${Math.round(value)}${unit} / ${goal ? Math.round(goal) + unit : '—'}</span>
        </div>
        <div class="macro-bar"><div class="macro-fill ${cls}" style="width:${pct}%"></div></div>
      </div>
    `;
  }

  function weightTrend(entries) {
    if (!entries || entries.length === 0) return null;
    const latest = entries[entries.length - 1];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const last7 = entries.filter((e) => e.date >= cutoffStr);
    const base = last7.length > 0 ? last7[0].weight : latest.weight;
    const diff = latest.weight - base;
    return {
      current: latest.weight,
      diff,
      diffLabel: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}kg sur 7 j`
    };
  }

  async function computeStreak() {
    // Séances + poids + repas comptent pour la régularité
    const [sessions, weights, entries] = await Promise.all([
      API.sessions.list(),
      API.body.weight(),
      API.nutrition.entries(todayStr())
    ]);
    const trackedDates = new Set();
    sessions.forEach((s) => trackedDates.add(s.date));
    weights.forEach((w) => trackedDates.add(w.date));
    entries.entries.forEach((e) => trackedDates.add(e.date));

    let streak = 0;
    const d = new Date();
    // Si aujourd'hui n'a pas encore de suivi, on vérifie à partir d'hier
    if (!trackedDates.has(todayStr())) d.setDate(d.getDate() - 1);
    while (trackedDates.has(d.toISOString().slice(0, 10))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  async function render() {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
      const profile = await API.getProfile();
      const sessions = await API.sessions.list();
      const weightEntries = await API.body.weight();
      const nutrition = await API.nutrition.entries(todayStr());
      const streak = await computeStreak();
      const displayName = profile.first_name || profile.name || 'Utilisateur';

      // Programmes permanents + historique
      const programs = sessions.filter((s) => Number(s.is_template) === 1);
      const history = sessions.filter((s) => Number(s.is_template) === 0);
      // Prochain programme : celui le moins avancé, ou le plus récent
      const todayProgram = programs.length ? programs[0] : null;
      const lastDone = history.length ? history[0] : null;

      // Tendances poids
      const trend = weightTrend(weightEntries);

      // Macro bars
      const totals = nutrition.totals;
      const goal = nutrition.goal;

      const macroBars = goal ? `
        ${macroBar(`${agogeIcon('fire')} Calories`, totals.calories, goal.calories, 'macro-cal', ' kcal')}
        ${macroBar(`${agogeIcon('dumbbell')} Protéines`, totals.proteins, goal.proteins, 'macro-prot')}
        ${macroBar(`${agogeIcon('bread')} Glucides`, totals.carbs, goal.carbs, 'macro-carb')}
        ${macroBar(`${agogeIcon('seedling')} Lipides`, totals.fats, goal.fats, 'macro-fat')}
      ` : `
        <p class="card-subtitle">Définis tes objectifs dans la page <strong>Alimentation</strong> pour voir tes macros ici.</p>
      `;

      const trendHtml = trend ? `
        <div class="stat-card">
          <div class="stat-label">Poids actuel</div>
          <div class="stat-value">${trend.current.toFixed(1)} kg</div>
          <div class="stat-detail ${trend.diff > 0.05 ? 'trend-up' : trend.diff < -0.05 ? 'trend-down' : 'trend-flat'}">
            ${trend.diffLabel}
          </div>
        </div>
      ` : `
        <div class="stat-card">
          <div class="stat-label">Poids</div>
          <div class="stat-value" style="font-size:16px">Aucune donnée</div>
          <div class="stat-detail">Ajoute ton poids dans Physique</div>
        </div>
      `;

      const todaySessionHtml = todayProgram ? `
        <div class="hero-card">
          <div class="hero-title">${agogeIcon('dumbbell')} Prochain entraînement</div>
          <div class="hero-subtitle">${todayProgram.name}</div>
          <div class="summary-pills">
            <span class="summary-pill">${agogeIcon('check')} ${todayProgram.done_exercises || 0}/${todayProgram.nb_exercises || 0} exercices</span>
            <span class="summary-pill">${agogeIcon('arrowsRotate')} ${todayProgram.nb_sets || 0} séries</span>
          </div>
          <div class="quick-actions">
            <button class="quick-action" onclick="App.navigate('sessions', {id:${todayProgram.id}})">
              ${(todayProgram.done_exercises || 0) > 0 ? `${agogeIcon('play')} Reprendre` : `${agogeIcon('play')} Démarrer`}
            </button>
            <button class="quick-action" onclick="App.navigate('sessions')">${agogeIcon('clipboard')} Mes programmes</button>
          </div>
          ${lastDone ? `<div class="card-subtitle" style="margin-top:10px">Dernière séance : ${lastDone.name} — ${fmtShortDate(lastDone.date)}</div>` : ''}
        </div>
      ` : `
        <div class="hero-card">
          <div class="hero-title">Pas encore de programme</div>
          <div class="hero-subtitle">Crée ton premier programme permanent pour démarrer une vraie routine.</div>
          <div class="quick-actions">
            <button class="quick-action" onclick="App.navigate('sessions')">${agogeIcon('dumbbell')} Créer un programme</button>
            <button class="quick-action" onclick="App.navigate('nutrition')">${agogeIcon('bowlFood')} Ajouter un repas</button>
          </div>
        </div>
      `;

      const foodsHtml = nutrition.entries.length
        ? nutrition.entries.slice(0, 5).map((e) => `
            <div class="food-entry">
              <div>
                <div class="fe-name">${e.food_name}</div>
                <div class="fe-macros">${Math.round(e.quantity)}${e.unit} • ${Math.round(e.calories)} kcal</div>
              </div>
            </div>
          `).join('')
        : '<p class="card-subtitle">Aucun repas enregistré aujourd\'hui.</p>';

      container.innerHTML = `
        <div class="greeting">${agogeIcon('clapping')} Bonjour, ${String(displayName).split(' ')[0]}</div>
        <div class="greeting-sub">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>

        ${todaySessionHtml}

        <div class="mini-stat-grid">
          <div class="mini-stat">
            <div class="ms-label">Régularité</div>
            <div class="ms-value">${streak} j</div>
          </div>
          <div class="mini-stat">
            <div class="ms-label">Repas</div>
            <div class="ms-value">${nutrition.entries.length}</div>
          </div>
        </div>

        <div class="stat-grid">
          ${trendHtml}
          <div class="stat-card">
            <div class="stat-label">Calories</div>
            <div class="stat-value">${Math.round(totals.calories)}</div>
            <div class="stat-detail">objectif ${goal ? Math.round(goal.calories) : '—'} kcal</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Protéines</div>
            <div class="stat-value">${Math.round(totals.proteins)}g</div>
            <div class="stat-detail">objectif ${goal ? Math.round(goal.proteins) : '—'}g</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Repas</div>
            <div class="stat-value">${nutrition.entries.length}</div>
            <div class="stat-detail">aliments ajoutés</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${agogeIcon('bowlFood')} Repas du jour</div>
              <div class="card-subtitle">${Math.round(totals.calories)} kcal consommées</div>
            </div>
            <button class="btn btn-sm" onclick="App.navigate('nutrition')">+ Ajouter</button>
          </div>
          <div class="macro-bars">${macroBars}</div>
          <div style="margin-top:12px">${foodsHtml}</div>
        </div>

        <div class="streak">
          <span class="fire">${streak > 0 ? agogeIcon('fire') : agogeIcon('bed')}</span>
          <div class="streak-info">
            <div class="streak-count">${streak} jour${streak > 1 ? 's' : ''}</div>
            <div class="streak-label">de régularité (séances, repas ou poids)</div>
          </div>
        </div>

        <button class="btn btn-outline btn-block" onclick="App.navigate('body')">${agogeIcon('chart')} Voir mon évolution physique</button>
      `;
    } catch (e) {
      container.innerHTML = `
        <div class="card">
          <div class="card-title" style="color:var(--danger)">${agogeIcon('warning')} Impossible de charger</div>
          <p class="card-subtitle" style="margin-top:8px">${e.message}</p>
          <button class="btn btn-primary btn-block" style="margin-top:12px" onclick="App.navigate('home')">Réessayer</button>
        </div>
      `;
    }
  }

  return { render };
})();

window.HomePage = HomePage;

