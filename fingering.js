// Digitación de la mano izquierda (qué dedo va en cada nota).
// 1) Genera todas las formas físicamente posibles de poner los dedos 1–4 en un acorde.
// 2) Puntúa cada una por comodidad: la mano en una posición fija con un dedo por traste,
//    pocas cejillas, poco meñique, y un extra si coincide con la digitación típica del diccionario.
// 3) Para toda la canción elige la secuencia que menos mueve la mano entre acordes
//    (mantener dedos que se repiten, deslizar un dedo guía por la misma cuerda…).
(function (root) {
  // Formas típicas y su digitación estándar, de 6ª a 1ª cuerda.
  // Las de cejilla (movable) están escritas en el traste 1 y valen en cualquier traste.
  const DICT = [
    // abiertos
    ['x32010', '032010'], ['x32033', '021034'], ['x32000', '032000'], ['x32310', '032410'],
    ['xx0232', '000132'], ['xx0231', '000231'], ['xx0212', '000213'], ['xx0222', '000123'],
    ['xx0230', '000130'], ['xx0233', '000134'],
    ['022100', '023100'], ['022000', '023000'], ['020100', '020100'], ['022030', '012030'],
    ['320003', '210003'], ['320003', '320004'], ['320001', '320001'], ['320002', '320001'], ['320000', '320000'],
    ['x02220', '001230'], ['x02210', '002310'], ['x02020', '002030'], ['x02010', '002010'],
    ['x02200', '001200'], ['x02230', '001230'], ['xx3210', '003210'],
    // cejillas y formas móviles
    ['133211', '134211', true], ['133111', '134111', true], ['131211', '131211', true], ['131111', '131111', true],
    ['x13331', '012341', true], ['x13331', '013331', true], ['x13321', '013421', true], ['x13131', '013141', true],
    ['x13121', '013121', true], ['x13231', '013241', true],
    ['x1323x', '013240', true],   // maj7 con raíz en la 5ª (Dmaj7 x5767x)
    ['x2313x', '023140', true],   // dim7 (Edim7 x7868x)
  ].map(([f, g, movable]) => ({
    frets: [...f].map(c => c === 'x' ? 'x' : +c),
    fingers: [...g].map(Number),
    movable: !!movable,
  }));

  const fretted = frets => frets.map((f, s) => ({ s, f })).filter(n => typeof n.f === 'number' && n.f > 0);

  // Digitación del diccionario que encaja con estas notas (o null)
  function fromDict(frets) {
    const ns = fretted(frets);
    if (ns.length < 2) return null;
    for (const d of DICT) {
      const offsets = d.movable ? [...new Set(ns.map(n => n.f - d.frets[n.s]))] : [0];
      if (offsets.length !== 1 || !Number.isFinite(offsets[0]) || offsets[0] < 0) continue;
      const o = offsets[0];
      const ok = frets.every((f, s) => {
        const df = d.frets[s];
        if (typeof f !== 'number') return true;
        if (f === 0) return df === 'x' || (df === 0 && !d.movable);
        return typeof df === 'number' && df > 0 && df + o === f && d.fingers[s] > 0;
      });
      if (ok) return frets.map((f, s) => (typeof f === 'number' && f > 0 ? d.fingers[s] : 0));
    }
    return null;
  }

  // Describe una digitación: posición de la mano y qué hace cada dedo
  function describe(frets, fingers) {
    const map = {};
    let bad = false;
    frets.forEach((f, s) => {
      const g = fingers[s];
      if (!g || typeof f !== 'number' || f === 0) return;
      if (map[g] && map[g].fret !== f) bad = true;   // un dedo no puede estar en dos trastes
      (map[g] = map[g] || { fret: f, strings: [] }).strings.push(s);
    });
    const used = Object.keys(map).map(Number);
    let P = null, posCost = 0;
    if (used.length) {
      // posición de la mano (traste del índice). Abrir la mano cuesta mucho más que juntar dedos.
      let best = Infinity;
      const maxF = Math.max(...used.map(g => map[g].fret));
      for (let p = 1; p <= maxF; p++) {
        let c = 0;
        for (const g of used) {
          const d = map[g].fret - (p + g - 1);
          c += d > 0 ? d * 1.0 : -d * 0.25;
        }
        if (c < best) { best = c; P = p; }
      }
      posCost = best;
    }
    return { fingers, map, P, posCost, bad };
  }

  function valid(frets, d) {
    if (d.bad) return false;
    const used = Object.keys(d.map).map(Number).sort((a, b) => a - b);
    const minF = Math.min(...fretted(frets).map(n => n.f));
    for (const g of used) {
      const { fret, strings } = d.map[g];
      if (strings.length > 1) {
        const lo = Math.min(...strings), hi = Math.max(...strings);
        if (g === 1) {
          // cejilla: en el traste más bajo y sin cuerdas al aire debajo
          if (fret !== minF) return false;
          for (let t = lo + 1; t < hi; t++) if (frets[t] === 0) return false;
        } else {
          // mini cejilla con otro dedo: hasta 3 cuerdas seguidas
          if (strings.length > 3 || hi - lo !== strings.length - 1) return false;
        }
      }
    }
    for (let i = 0; i < used.length; i++)
      for (let j = i + 1; j < used.length; j++) {
        const a = used[i], b = used[j], fa = d.map[a].fret, fb = d.map[b].fret;
        if (fa > fb) return false;                 // los dedos no se cruzan
        if (fb - fa > (b - a) + 1) return false;   // apertura máxima
      }
    return true;
  }

  function comfort(d) {
    let c = d.posCost;
    const used = Object.keys(d.map).map(Number);
    for (const g of used) {
      const n = d.map[g].strings.length;
      if (n > 1) c += g === 1 ? 0.6 + 0.1 * n : (g === 4 ? 1.2 : 0.8) * n;   // cejilla (con otros dedos cuesta más)
      c += 0.05 * g;
    }
    if (d.map[4]) c += 0.15;
    // mismo traste con dos dedos: lo normal es el dedo menor en la cuerda más grave
    for (const a of used) for (const b of used)
      if (a < b && d.map[a].fret === d.map[b].fret && Math.min(...d.map[a].strings) > Math.min(...d.map[b].strings)) c += 0.8;
    return c;
  }

  // Todas las digitaciones razonables para una forma, de mejor a peor
  function candidates(frets, override) {
    if (override) return [Object.assign(describe(frets, override), { cost: 0 })];
    const ns = fretted(frets);
    if (!ns.length) return [Object.assign(describe(frets, [0, 0, 0, 0, 0, 0]), { cost: 0 })];
    const dict = fromDict(frets);
    const out = [];
    const cur = [0, 0, 0, 0, 0, 0];
    (function rec(k) {
      if (k === ns.length) {
        const d = describe(frets, cur.slice());
        if (!valid(frets, d)) return;
        d.cost = comfort(d);
        if (dict && d.fingers.every((g, s) => g === dict[s])) d.cost -= 0.8;
        out.push(d);
        return;
      }
      for (let g = 1; g <= 4; g++) { cur[ns[k].s] = g; rec(k + 1); }
      cur[ns[k].s] = 0;
    })(0);
    out.sort((a, b) => a.cost - b.cost);
    return out.slice(0, 14);
  }

  // Coste de pasar de una digitación a otra
  function transition(p, c) {
    let t = 0;
    if (p.P && c.P) t += 0.35 * Math.abs(c.P - p.P);
    for (const g of Object.keys(c.map).map(Number)) {
      const a = p.map[g], b = c.map[g];
      if (!a) { t += 0.25; continue; }
      const share = b.strings.some(s => a.strings.includes(s));
      if (share && a.fret === b.fret) t -= 0.3;               // el dedo se queda donde está
      else if (share) t += 0.15 * Math.abs(a.fret - b.fret);  // dedo guía: desliza por la misma cuerda
      else t += 0.5 + 0.1 * Math.abs(a.fret - b.fret);
    }
    return t;
  }

  // Elige la digitación de cada acorde de la secuencia (programación dinámica)
  function optimize(shapes, overrides = {}) {
    if (!shapes.length) return [];
    const cands = shapes.map(f => candidates(f, overrides[f.join(',')]));
    let score = cands[0].map(c => c.cost);
    const back = [];
    for (let i = 1; i < cands.length; i++) {
      const prev = cands[i - 1], ns = [], bk = [];
      for (const c of cands[i]) {
        let best = Infinity, arg = 0;
        prev.forEach((p, j) => {
          const v = score[j] + transition(p, c);
          if (v < best) { best = v; arg = j; }
        });
        ns.push(best + c.cost); bk.push(arg);
      }
      score = ns; back.push(bk);
    }
    let k = score.indexOf(Math.min(...score));
    const res = [];
    for (let i = cands.length - 1; i >= 0; i--) {
      res[i] = cands[i][k].fingers;
      if (i > 0) k = back[i - 1][k];
    }
    return res;
  }

  root.Fingering = { optimize, candidates, fromDict };
})(typeof window !== 'undefined' ? window : globalThis);
