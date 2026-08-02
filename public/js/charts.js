/* ============================================
   AGOGE - Graphiques légers (Canvas)
   Poids : évolution dans le temps
   Macros : barres quotidiennes sur 7 jours
   ============================================ */
const Charts = (() => {
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Graphique de poids
   * @param {HTMLCanvasElement} canvas
   * @param {Array} entries - [{date, weight}]
   */
  function weightChart(canvas, entries) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width || 320;
    const H = 220;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!entries || entries.length < 1) {
      ctx.fillStyle = '#6a6a6a';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ajoute ton poids pour voir la courbe 📈', W / 2, H / 2);
      return;
    }

    const pad = { l: 40, r: 12, t: 16, b: 28 };
    const chartW = W - pad.l - pad.r;
    const chartH = H - pad.t - pad.b;

    const weights = entries.map((e) => e.weight);
    const min = Math.floor(Math.min(...weights) - 1);
    const max = Math.ceil(Math.max(...weights) + 1);
    const range = max - min || 1;

    const x = (i) => pad.l + (entries.length === 1 ? chartW / 2 : (i / (entries.length - 1)) * chartW);
    const y = (w) => pad.t + ((max - w) / range) * chartH;

    // Grid lines
    ctx.strokeStyle = '#2a2a2a';
    ctx.fillStyle = '#6a6a6a';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = min + (range * i) / 4;
      const yy = y(val);
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(W - pad.r, yy);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), pad.l - 6, yy + 3);
    }

    // Line
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    entries.forEach((e, i) => {
      const xx = x(i), yy = y(e.weight);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    // Area gradient
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + chartH);
    grad.addColorStop(0, 'rgba(255, 107, 53, 0.25)');
    grad.addColorStop(1, 'rgba(255, 107, 53, 0)');
    ctx.beginPath();
    entries.forEach((e, i) => {
      const xx = x(i), yy = y(e.weight);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.lineTo(x(entries.length - 1), pad.t + chartH);
    ctx.lineTo(x(0), pad.t + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Points
    entries.forEach((e, i) => {
      const xx = x(i), yy = y(e.weight);
      ctx.beginPath();
      ctx.arc(xx, yy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b35';
      ctx.fill();
      // Last point highlight
      if (i === entries.length - 1) {
        ctx.beginPath();
        ctx.arc(xx, yy, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // X labels (dates)
    ctx.fillStyle = '#6a6a6a';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const step = Math.ceil(entries.length / 4);
    entries.forEach((e, i) => {
      if (i % step === 0 || i === entries.length - 1) {
        const d = new Date(e.date + 'T00:00:00');
        const label = `${d.getDate()}/${d.getMonth() + 1}`;
        ctx.fillText(label, x(i), H - 8);
      }
    });
  }

  /**
   * Graphique macros hebdo (barres)
   * @param {HTMLCanvasElement} canvas
   * @param {Array} days - [{date, calories}]
   */
  function macrosChart(canvas, days) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width || 320;
    const H = 150;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!days || !days.length) {
      ctx.fillStyle = '#6a6a6a';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pas encore de données', W / 2, H / 2);
      return;
    }

    const pad = { l: 8, r: 8, t: 10, b: 20 };
    const chartW = W - pad.l - pad.r;
    const chartH = H - pad.t - pad.b;
    const max = Math.max(...days.map((d) => d.calories), 1);
    const barW = Math.min(28, (chartW / days.length) * 0.6);
    const gap = chartW / days.length;

    days.forEach((d, i) => {
      const cx = pad.l + gap * i + gap / 2;
      const bh = (d.calories / max) * chartH;
      const bx = cx - barW / 2;
      const by = pad.t + chartH - bh;

      ctx.fillStyle = '#2e2e2e';
      roundRect(ctx, bx, pad.t, barW, chartH, 4);
      ctx.fill();

      ctx.fillStyle = d.calories > 0 ? '#ff6b35' : '#3a3a3a';
      if (bh > 0) {
        roundRect(ctx, bx, by, barW, bh, 4);
        ctx.fill();
      }

      ctx.fillStyle = '#6a6a6a';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      const dd = new Date(d.date + 'T00:00:00');
      ctx.fillText(`${dd.getDate()}/${dd.getMonth() + 1}`, cx, H - 6);
    });
  }

  return { weightChart, macrosChart };
})();

window.Charts = Charts;

