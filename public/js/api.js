/* ============================================
   AGOGE - Client API + file hors-ligne
   ============================================ */
const API = (() => {
  const BASE = '';
  const OFFS = 'https://world.openfoodfacts.org/cgi/search.pl';

  // Helper pour proxy les images OpenFoodFacts et éviter les problèmes CORS
  function proxyImage(imageUrl) {
    if (!imageUrl) return '';
    if (imageUrl.includes('openfoodfacts.org') || imageUrl.includes('openfoodfacts.net')) {
      return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    }
    return imageUrl;
  }

  function getConfiguredApiBase() {
    if (typeof window === 'undefined' || !window) return null;
    const candidates = [
      window.__AGOGE_API_URL__,
      window.__AGOGE_API_BASE__,
      window.__AGOGE_BACKEND_URL__,
      new URLSearchParams(window.location.search).get('apiUrl')
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const value = String(candidate).trim();
      if (!value) continue;
      try {
        const parsed = new URL(value);
        return parsed.origin + (parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/$/, '') : '');
      } catch (e) {
        return value.replace(/\/$/, '');
      }
    }

    return null;
  }

  function getApiOrigins() {
    const origins = [];
    const configuredBase = getConfiguredApiBase();
    if (configuredBase) origins.push(configuredBase);

    if (typeof window !== 'undefined' && window.location) {
      const rawOrigin = window.location.origin;
      if (rawOrigin && rawOrigin !== 'null') {
        origins.push(rawOrigin);
      }

      const host = window.location.hostname || 'localhost';
      const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)
        || host.endsWith('.test')
        || host.endsWith('.local')
        || host.endsWith('.localhost')
        || window.location.protocol === 'file:';

      if (isLocalHost) {
        const fallback = ['http://localhost:3001', 'http://127.0.0.1:3001'];
        fallback.forEach((origin) => origins.push(origin));
      }
    }

    return Array.from(new Set(origins.filter(Boolean)));
  }

  function getApiUrls(path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const configuredBase = getConfiguredApiBase();
    if (configuredBase) {
      const normalizedBase = configuredBase.replace(/\/$/, '');
      if (/\/api$/i.test(normalizedBase) && /^\/api/i.test(normalizedPath)) {
        return [`${normalizedBase}${normalizedPath.replace(/^\/api/i, '')}`];
      }
      return [`${normalizedBase}${normalizedPath}`];
    }

    return getApiOrigins().map((origin) => `${origin}${normalizedPath}`);
  }

  function getToken() {
    return localStorage.getItem('agoge_token') || null;
  }

  function setToken(token) {
    if (token) localStorage.setItem('agoge_token', token);
    else localStorage.removeItem('agoge_token');
  }

  async function request(path, options = {}, useCache = false) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const fetchOptions = { ...options, headers };
    const urls = getApiUrls(path);

    let lastError = null;
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index];
      try {
        if (!navigator.onLine) throw new Error('offline');
        const res = await fetch(url, fetchOptions);
        if (res.status === 401) {
          setToken(null);
          window.dispatchEvent(new CustomEvent('agoge:logout'));
          throw new Error('Session expirée');
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const message = data.error || 'Erreur serveur';
          if ((res.status === 404 || res.status === 405) && index < urls.length - 1) {
            lastError = new Error(message);
            continue;
          }
          throw new Error(message);
        }
        const data = await res.json();
        if (options.method === undefined || options.method === 'GET') {
          await IDB.cacheSet(`${path}${options.cacheKey || ''}`, data);
        }
        return data;
      } catch (e) {
        lastError = e;
        if (useCache && (options.method === undefined || options.method === 'GET')) {
          const cached = await IDB.cacheGet(`${path}${options.cacheKey || ''}`);
          if (cached) return cached;
        }
        const isMutation = ['POST', 'PUT', 'DELETE'].includes(options.method);
        if (isMutation && !navigator.onLine) {
          await IDB.enqueue(path, { method: options.method, body: options.body ? JSON.parse(options.body) : null });
          return { queued: true };
        }
        if (index < urls.length - 1 && (e.message === 'Failed to fetch' || e.message === 'offline' || /404|405/.test(e.message))) {
          continue;
        }
        throw e;
      }
    }

    throw lastError || new Error('Erreur réseau');
  }

  // ---- AUTH ----
  async function register(data) {
    const urls = getApiUrls('/api/auth/register');
    let lastError = null;
    for (let index = 0; index < urls.length; index += 1) {
      try {
        const res = await fetch(urls[index], {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const text = await res.text();
        let json = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch (parseError) {
          json = {};
        }
        if (!res.ok) throw new Error(json.error || 'Erreur serveur');
        setToken(json.token);
        return json;
      } catch (e) {
        lastError = e;
        const message = e && e.message ? e.message : '';
        if (index < urls.length - 1 && (message === 'Failed to fetch' || message === 'NetworkError when attempting to fetch' || /404|405/.test(message))) {
          continue;
        }
        break;
      }
    }
    throw lastError || new Error('Erreur réseau');
  }

  async function login(data) {
    const urls = getApiUrls('/api/auth/login');
    let lastError = null;
    for (let index = 0; index < urls.length; index += 1) {
      try {
        const res = await fetch(urls[index], {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const text = await res.text();
        let json = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch (parseError) {
          json = {};
        }
        if (!res.ok) throw new Error(json.error || 'Erreur serveur');
        setToken(json.token);
        return json;
      } catch (e) {
        lastError = e;
        const message = e && e.message ? e.message : '';
        if (index < urls.length - 1 && (message === 'Failed to fetch' || message === 'NetworkError when attempting to fetch' || /404|405/.test(message))) {
          continue;
        }
        break;
      }
    }
    throw lastError || new Error('Erreur réseau');
  }

  async function getProfile() {
    return request('/api/auth/profile', {}, true);
  }

  async function updateProfile(data) {
    return request('/api/auth/profile', { method: 'PUT', body: JSON.stringify(data) }, true);
  }

  async function setTheme(theme) {
    return request('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ theme }) }, true);
  }

  // ---- SESSIONS (programmes permanents) ----
  const sessions = {
    list: () => request('/api/sessions', {}, true),
    get: (id) => request(`/api/sessions/${id}`, {}, true),
    create: (data) => request('/api/sessions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/api/sessions/${id}`, { method: 'DELETE' }),
    updateExercise: (exId, data) => request(`/api/sessions/exercises/${exId}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateSet: (setId, data) => request(`/api/sessions/sets/${setId}`, { method: 'PUT', body: JSON.stringify(data) }),
    reset: (id) => request(`/api/sessions/${id}/reset`, { method: 'POST', body: JSON.stringify({}) }),
    complete: (id, date) => request(`/api/sessions/${id}/complete`, { method: 'POST', body: JSON.stringify({ date }) })
  };

  // ---- NUTRITION ----
  const nutrition = {
    entries: (date) => request(`/api/nutrition/entries?date=${date}`, {}, true),
    addEntry: (data) => request('/api/nutrition/entries', { method: 'POST', body: JSON.stringify(data) }),
    removeEntry: (id) => request(`/api/nutrition/entries/${id}`, { method: 'DELETE' }),
    setGoals: (data) => request('/api/nutrition/goals', { method: 'PUT', body: JSON.stringify(data) }),
    stats: () => request('/api/nutrition/stats', {}, true),
    recipes: () => request('/api/nutrition/recipes', {}, true),
    createRecipe: (data) => request('/api/nutrition/recipes', { method: 'POST', body: JSON.stringify(data) }),
    addRecipe: (id, data) => request(`/api/nutrition/recipes/${id}/add`, { method: 'POST', body: JSON.stringify(data) })
  };

  // ---- BODY ----
  const body = {
    weight: () => request('/api/body/weight', {}, true),
    addWeight: (data) => request('/api/body/weight', { method: 'POST', body: JSON.stringify(data) }),
    removeWeight: (id) => request(`/api/body/weight/${id}`, { method: 'DELETE' }),
    measurements: () => request('/api/body/measurements', {}, true),
    addMeasurement: (data) => request('/api/body/measurements', { method: 'POST', body: JSON.stringify(data) }),
    removeMeasurement: (id) => request(`/api/body/measurements/${id}`, { method: 'DELETE' }),
    photos: () => request('/api/body/photos', {}, true),
    uploadPhoto: async (formData) => {
      const urls = getApiUrls('/api/body/photos');
      let lastError = null;
      for (let index = 0; index < urls.length; index += 1) {
        try {
          const res = await fetch(urls[index], {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}` },
            body: formData
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Upload échoué');
          }
          return res.json();
        } catch (e) {
          lastError = e;
          if (index < urls.length - 1 && (e.message === 'Failed to fetch' || /404|405/.test(e.message))) continue;
        }
      }
      throw lastError || new Error('Upload échoué');
    },
    removePhoto: (id) => request(`/api/body/photos/${id}`, { method: 'DELETE' })
  };

  // ---- OPENFOODFACTS ----
  const PRODUCT_FIELDS = [
    'code', 'product_name', 'generic_name', 'brands', 'quantity', 'image_front_url',
    'nutriments', 'ingredients_text_fr', 'allergens_from_ingredients', 'nutriscore_grade',
    'nova_group'
  ].join(',');

  // Normalise une valeur nutritionnelle (gère energy en kJ vs kcal)
  function normNum(v, fallback = 0) {
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }

  function kcalFromNutriments(n) {
    if (!n) return 0;
    if (n['energy-kcal_100g']) return normNum(n['energy-kcal_100g']);
    // energy en kJ -> conversion en kcal
    const energy = normNum(n.energy_100g || n.energy, 0);
    return energy ? Math.round(energy / 4.184) : 0;
  }

  async function fetchJsonWithRetry(url, options = {}, { timeoutMs = 5000, retries = 2 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok && res.status !== 429 && res.status < 500) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return await res.json();
      } catch (e) {
        clearTimeout(timeoutId);
        lastError = e;
        if (attempt >= retries || e.name === 'AbortError' || !navigator.onLine) {
          throw e;
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  // Nettoie le nom d'un produit (évite les fallbacks marque inutiles)
  function cleanName(p) {
    const name = (p.product_name || '').trim();
    if (name) return name;
    const generic = (p.generic_name || '').trim();
    if (generic) return generic;
    return '';
  }

  // Détecte si le produit est un liquide (100ml au lieu de 100g)
  function isLiquid(p) {
    const q = (p.quantity || '').toLowerCase();
    return /ml|cl|l\b|millilitre|centilitre|litre/.test(q);
  }

  // Normalise un texte : minuscules + suppression des accents (à, é, è, ç…)
  // Permet à la recherche d'ignorer l'orthographe exacte (ex : "pate" trouve "Pâtes").
  function normalizeText(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // Score de pertinence : correspondance du nom avec la recherche (insensible aux accents/casse)
  function relevanceScore(name, terms) {
    const lower = normalizeText(name);
    if (!lower) return -1;
    let score = 0;
    for (const t of terms) {
      if (lower.includes(t)) score += 2;
    }
    // Bonus si le nom COMMENCE par le premier terme
    if (lower.startsWith(terms[0])) score += 1;
    return score;
  }

  async function searchFood(query) {
    const normQuery = normalizeText(query);
    const cached = await IDB.getCachedFood(normQuery);
    if (cached && !navigator.onLine) return cached;

    if (query && query.trim()) {
      try {
        const localResults = await request(`/api/nutrition/search?q=${encodeURIComponent(query)}&limit=20`, {}, true);
        if (Array.isArray(localResults) && localResults.length > 0) {
          const normalized = localResults.map((r) => ({
            ...r,
            image: proxyImage(r.image || ''),
            id: r.id || r.code,
            liquid: r.liquid || (r.quantity ? /ml|cl|l\b/i.test(r.quantity) : false),
            _relevance: relevanceScore(r.name || '', normQuery.split(/\s+/).filter(Boolean))
          }));
          await IDB.cacheFood(normQuery, normalized);
          return normalized;
        }
      } catch (e) {
        // fallback to OpenFoodFacts below
      }
    }

    const url = `/api/proxy-offs?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&lc=fr&cc=FR&page_size=50&fields=${PRODUCT_FIELDS}`;
    const data = await fetchJsonWithRetry(url, { headers: { Accept: 'application/json' } }, { timeoutMs: 6000, retries: 2 });

    const terms = normQuery.split(/\s+/).filter(Boolean);

    const results = (data.products || [])
      .map((p) => {
        const name = cleanName(p);
        if (!name) return null;
        const n = p.nutriments || {};
        const liquid = isLiquid(p);
        return {
          id: p.code || p._id,
          name,
          brands: p.brands || '',
          quantity: p.quantity || '',
          image: proxyImage(p.image_front_url || ''),
          liquid,
          calories: kcalFromNutriments(n),
          proteins: normNum(n.proteins_100g),
          carbs: normNum(n.carbohydrates_100g),
          fats: normNum(n.fat_100g),
          fibers: normNum(n.fiber_100g),
          sugars: normNum(n.sugars_100g),
          salt: normNum(n.salt_100g),
          sodium: normNum(n.sodium_100g),
          nutriscore: p.nutriscore_grade || '',
          nova: p.nova_group || null,
          ingredients: p.ingredients_text_fr || '',
          allergens: p.allergens_from_ingredients || '',
          _relevance: relevanceScore(name, terms)
        };
      })
      .filter((r) => r !== null)
      .sort((a, b) => {
        if (b._relevance !== a._relevance) return b._relevance - a._relevance;
        return b.calories - a.calories;
      })
      .filter((r) => r._relevance > 0)
      .slice(0, 20);

    await IDB.cacheFood(normQuery, results);
    return results;
  }

  async function getFood(barcode) {
    const cacheKey = `food_${barcode}`;
    const cached = await IDB.cacheGet(cacheKey);
    if (cached && !navigator.onLine) return cached;
    const url = `/api/proxy-offs-barcode/${encodeURIComponent(barcode)}`;
    const data = await fetchJsonWithRetry(url, { headers: { Accept: 'application/json' } }, { timeoutMs: 6000, retries: 2 });
    const p = data.product;
    if (!p || !p.code) throw new Error('Produit introuvable');
    const n = p.nutriments || {};
    const liquid = isLiquid(p);
    const product = {
      id: p.code,
      name: cleanName(p) || 'Aliment',
      brands: p.brands || '',
      quantity: p.quantity || '',
      image: proxyImage(p.image_front_url || p.image_url || ''),
      liquid,
      calories: kcalFromNutriments(n),
      proteins: normNum(n.proteins_100g),
      carbs: normNum(n.carbohydrates_100g),
      fats: normNum(n.fat_100g),
      fibers: normNum(n.fiber_100g),
      sugars: normNum(n.sugars_100g),
      salt: normNum(n.salt_100g),
      sodium: normNum(n.sodium_100g),
      nutriscore: p.nutriscore_grade || '',
      nova: p.nova_group || null,
      ingredients: p.ingredients_text_fr || '',
      allergens: p.allergens_from_ingredients || '',
      per100: liquid ? '100 ml' : '100 g'
    };
    await IDB.cacheSet(cacheKey, product);
    return product;
  }

  // ---- SYNC offline queue ----
  async function syncNow() {
    const queue = await IDB.getQueue();
    if (!queue.length) return { synced: 0 };
    let synced = 0;
    for (const item of queue) {
      try {
        await request(item.action, {
          method: item.payload.method,
          body: JSON.stringify(item.payload.body)
        });
        await IDB.removeFromQueue(item.key);
        synced++;
      } catch (e) {
        if (!navigator.onLine) break;
        console.log('Sync item failed (kept in queue)', e);
      }
    }
    return { synced };
  }

  return {
    getToken, setToken, request,
    register, login, getProfile, updateProfile, setTheme,
    sessions, nutrition, body,
    searchFood, getFood, syncNow
  };
})();

window.API = API;

