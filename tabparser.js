// Convierte un tab ASCII (estilo Ultimate Guitar) al formato de la app:
//   { measures: [{ section, notes: ['A5 G6 B7', ...], shapes: [key por casilla], chords: { slot: key } }],
//     chords: { key: { name, frets, fingers } } }
// - Ritmo por grupos (por defecto): notas separadas por 2 guiones = una casilla; un hueco de 3+ guiones
//   empieza otro grupo (medio compás de 4 casillas).
// - Ritmo por rejilla (opts.grid): cada `charsPerSlot` caracteres = una casilla, para tabs sin grupos claros.
// - Marcas tipo ")x3" a la derecha del bloque lo repiten.
// - Técnicas: h, p, / y \ (slides), b (bend), +7+ (armónico) se guardan detrás del traste: "B10h".
// - shapes: la forma de la mano en cada casilla. Solo las que son acorde (2+ trastes pisados o 3+ cuerdas)
//   llevan diagrama; las notas sueltas de un riff solo llevan el número de dedo.
// - Los dedos se eligen con fingering.js para toda la canción.
(function (root) {
  const STR = ['E', 'A', 'D', 'G', 'B', 'e'];   // identificador interno de cada cuerda (6ª a 1ª)
  const STANDARD = [40, 45, 50, 55, 59, 64];
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const TEMPLATES = [
    ['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]],
    ['dim', [0, 3, 6]], ['dim7', [0, 3, 6, 9]], ['m7b5', [0, 3, 6, 10]], ['aug', [0, 4, 8]],
    ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]],
    ['add9', [0, 2, 4, 7]], ['madd9', [0, 2, 3, 7]], ['9', [0, 2, 4, 7, 10]], ['maj9', [0, 2, 4, 7, 11]],
    ['m9', [0, 2, 3, 7, 10]], ['7sus4', [0, 5, 7, 10]], ['6/9', [0, 2, 4, 7, 9]], ['m(maj7)', [0, 3, 7, 11]],
    ['5', [0, 7]],
  ];

  // "D A D F# B E" (de 6ª a 1ª) -> notas MIDI al aire, en la octava más cercana a la afinación estándar
  function parseTuning(str) {
    if (!str) return STANDARD.slice();
    const names = str.trim().split(/\s+/);
    if (names.length !== 6) return STANDARD.slice();
    return names.map((n, i) => {
      const pc = NOTE.indexOf(n[0].toUpperCase() + (n[1] === '#' ? '#' : ''));
      const flat = n[1] === 'b' ? -1 : 0;
      const p = (pc + flat + 12) % 12;
      let m = STANDARD[i] - ((STANDARD[i] - p) % 12 + 12) % 12;   // misma nota, por debajo o igual
      if (STANDARD[i] - m > 6) m += 12;
      return m;
    });
  }

  function nameChord(frets, open = STANDARD) {
    const midis = [];
    frets.forEach((f, s) => { if (typeof f === 'number') midis.push(open[s] + f); });
    if (!midis.length) return '';
    const bass = Math.min(...midis) % 12;
    const pcs = [...new Set(midis.map(m => m % 12))];
    if (pcs.length === 1) return NOTE[pcs[0]];
    let best = null;
    for (const r of pcs) {
      const rel = new Set(pcs.map(p => (p - r + 12) % 12));
      TEMPLATES.forEach(([suf, t], ti) => {
        const full = [...rel].every(x => t.includes(x));
        if (!full) return;
        // se permite que falte la quinta
        const missing = t.filter(x => !rel.has(x));
        if (missing.some(x => x !== 7)) return;
        const score = missing.length * 3 + (r === bass ? 0 : 2) + ti * 0.01;
        if (!best || score < best.score) best = { score, name: NOTE[r] + suf + (r === bass ? '' : '/' + NOTE[bass]) };
      });
    }
    if (best) return best.name;
    // acorde base + tensiones añadidas
    const EXT = { 1: 'b9', 2: '9', 3: '#9', 5: '11', 6: '#11', 8: 'b13', 9: '13', 10: '7', 11: 'maj7' };
    for (const r of [bass, ...pcs.filter(p => p !== bass)]) {
      const rel = new Set(pcs.map(p => (p - r + 12) % 12));
      for (const [suf, t] of TEMPLATES) {
        if (t.length < 3 || !t.every(x => rel.has(x) || x === 7)) continue;
        const extra = [...rel].filter(x => !t.includes(x));
        if (extra.every(x => EXT[x]))
          return NOTE[r] + suf + '(' + extra.map(x => EXT[x]).join(',') + ')' + (r === bass ? '' : '/' + NOTE[bass]);
      }
    }
    return NOTE[bass] + '?';
  }

  function parseBlock(lines) {
    // lines: 6 cuerdas, de la 1ª (arriba) a la 6ª -> eventos [{pos, notes:[{s,f,t}]}]
    const events = new Map();
    lines.forEach((ln, li) => {
      const s = 5 - li;
      for (let i = 0; i < ln.length; i++) {
        if (/\d/.test(ln[i])) {
          let j = i; while (j + 1 < ln.length && /\d/.test(ln[j + 1])) j++;
          const f = parseInt(ln.slice(i, j + 1), 10);
          // técnica: h/p/slide llegando a la nota, slide/bend saliendo de ella, +7+ = armónico
          const before = ln[i - 1] || '', after = ln[j + 1] || '';
          let t = '';
          if (before === '+' || after === '+') t = '+';
          else if (before && 'hp/\\'.includes(before)) t = before;
          else if (after && '/\\b'.includes(after)) t = after;
          if (!events.has(i)) events.set(i, []);
          events.get(i).push({ s, f, t });
          i = j;
        } else if (ln[i] === '|') {
          if (!events.has(i)) events.set(i, null); // barra de compás interna
        }
      }
    });
    return [...events.entries()].sort((a, b) => a[0] - b[0]).map(([pos, notes]) => ({ pos, notes }));
  }

  function groupEvents(events) {
    const groups = []; let cur = null, last = -99;
    for (const ev of events) {
      if (ev.notes === null) { cur = null; last = -99; continue; }
      if (!cur || ev.pos - last >= 3) { cur = { start: ev.pos, evs: [] }; groups.push(cur); }
      cur.evs.push(ev); last = ev.pos;
    }
    return groups.map(g => {
      let prev = -1;
      const placed = g.evs.map(ev => {
        let idx = Math.max(Math.round((ev.pos - g.start) / 2), prev + 1);
        prev = idx; return { idx, notes: ev.notes };
      });
      const len = Math.ceil((prev + 1) / 4) * 4;
      const slots = Array.from({ length: len }, () => []);
      placed.forEach(p => slots[p.idx].push(...p.notes));
      return slots;
    });
  }

  // Rejilla fija: la posición en el texto marca el tiempo
  function gridSlots(events, cps) {
    const evs = events.filter(e => e.notes);
    if (!evs.length) return [];
    const first = evs[0].pos, slots = [];
    let prev = -1;
    for (const ev of evs) {
      const idx = Math.max(Math.round((ev.pos - first) / cps), prev + 1);
      slots[idx] = (slots[idx] || []).concat(ev.notes);
      prev = idx;
    }
    for (let i = 0; i < slots.length; i++) slots[i] = slots[i] || [];
    return slots;
  }

  function shapeOf(slots) {
    const frets = ['x', 'x', 'x', 'x', 'x', 'x'];
    for (let s = 0; s < 6; s++) {
      const fs = slots.flat().filter(n => n.s === s).map(n => n.f);
      if (!fs.length) continue;
      const nz = fs.filter(f => f > 0);
      const pool = nz.length ? nz : fs;
      const count = {}; pool.forEach(f => count[f] = (count[f] || 0) + 1);
      frets[s] = +Object.keys(count).sort((a, b) => count[b] - count[a] || pool.indexOf(+a) - pool.indexOf(+b))[0];
    }
    return frets;
  }

  // ¿Las notas de este trozo encajan en la forma anterior? (entonces sigue siendo el mismo acorde)
  function fitsShape(slots, frets) {
    const ns = slots.flat();
    return ns.length > 0 && ns.every(n => frets[n.s] === n.f);
  }

  // si dentro de un trozo una cuerda cambia de traste, es otra posición de la mano (p. ej. una melodía)
  function splitRuns(slots) {
    const runs = [];
    let run = [], shape = {};
    for (const sl of slots) {
      if (run.length && sl.some(n => shape[n.s] !== undefined && shape[n.s] !== n.f)) { runs.push(run); run = []; shape = {}; }
      run.push(sl);
      sl.forEach(n => shape[n.s] = n.f);
    }
    if (run.length) runs.push(run);
    return runs;
  }

  // opts.fingers: digitaciones fijadas a mano { 'x,5,7,6,7,x': [0,1,3,2,4,0] }
  // opts.tuning:  "D A D F# B E" · opts.grid: { charsPerSlot, slotsPerMeasure, window }
  function parseAsciiTab(text, opts = {}) {
    const open = parseTuning(opts.tuning);
    const lines = text.split(/\r?\n/);
    const blocks = [];
    let section = null;
    const re = /^\s*([A-Ga-g][#b]?)\s*\|(.*)$/;
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(/^\s*\[(.+)\]\s*$/);
      if (h) { section = h[1]; continue; }
      const part = lines[i].match(/^\s*\(([^)]+)\)\s*$/);   // "(Part A)" debajo de la sección
      if (part) { section = section ? section + ' · ' + part[1] : part[1]; continue; }
      const rm = lines[i].match(/^\s*\)\s*x\s*(\d+)/i);   // ") x2" suelto entre bloques
      if (rm && blocks.length) { blocks[blocks.length - 1].reps = Math.max(blocks[blocks.length - 1].reps, +rm[1]); continue; }
      const blk = [0, 1, 2, 3, 4, 5].map(k => { const m = (lines[i + k] || '').match(re); return m ? m[2] : null; });
      if (blk.some(x => x === null)) continue;
      i += 5;
      let reps = 1, paren = false;
      const content = blk.map(ln => {
        const lastBar = ln.lastIndexOf('|');
        const tail = lastBar >= 0 ? ln.slice(lastBar + 1) : '';
        if (tail.includes(')')) paren = true;
        const m = tail.match(/x\s*(\d+)/i); if (m) reps = Math.max(reps, +m[1]);
        return lastBar >= 0 ? ln.slice(0, lastBar) : ln;
      });
      const events = parseBlock(content);
      // compases, cada uno troceado en ventanas donde se busca el acorde
      const measuresW = [];
      if (opts.grid) {
        const { charsPerSlot = 2, slotsPerMeasure = 12, window = 6 } = opts.grid;
        const sl = gridSlots(events, charsPerSlot);
        for (let m = 0; m < sl.length; m += slotsPerMeasure) {
          const ms = sl.slice(m, m + slotsPerMeasure);
          while (ms.length % window) ms.push([]);
          const ws = [];
          for (let k = 0; k < ms.length; k += window) ws.push(ms.slice(k, k + window));
          measuresW.push(ws);
        }
      } else {
        let cur = null, len = 0;
        for (const g of groupEvents(events))
          for (let k = 0; k < g.length; k += 4) {
            if (!cur || len >= 8) { cur = []; measuresW.push(cur); len = 0; }
            const half = g.slice(k, k + 4);
            cur.push(half); len += half.length;
          }
      }
      // forma de la mano en cada casilla
      const blockMeasures = [];
      let inst = null;
      for (const ws of measuresW) {
        const cur = { notes: [], chords: {}, shapes: [] };
        blockMeasures.push(cur);
        for (const win of ws)
          for (const run of splitRuns(win)) {
            const ns = run.flat();
            const allOpen = ns.every(n => n.f === 0) && inst;   // soltar dedos: sigue la misma forma
            if (ns.length && !allOpen && !(inst && fitsShape(run, inst.frets))) {
              const frets = shapeOf(run);
              const played = frets.filter(f => typeof f === 'number');
              inst = { frets, diagram: played.filter(f => f > 0).length >= 2 || played.length >= 3 };
              if (inst.diagram) cur.chords[cur.notes.length] = inst;
            }
            run.forEach(sl => {
              cur.notes.push(sl.map(n => STR[n.s] + n.f + n.t).join(' '));
              cur.shapes.push(inst);
            });
          }
      }
      blocks.push({ section, measures: blockMeasures, reps, paren });
      section = null;
    }
    // expandir repeticiones: bloques seguidos marcados con ")" forman un grupo
    const measures = [];
    for (let b = 0; b < blocks.length; b++) {
      let e = b;
      if (blocks[b].paren) while (e + 1 < blocks.length && blocks[e + 1].paren && !blocks[e + 1].section) e++;
      const grp = blocks.slice(b, e + 1);
      const reps = Math.max(...grp.map(x => x.reps));
      for (let r = 0; r < reps; r++) {
        grp.forEach((blk, bi) => blk.measures.forEach((m, k) => {
          const copy = { notes: m.notes, chords: { ...m.chords }, shapes: m.shapes.slice() };
          if (bi === 0 && k === 0) {
            if (r === 0 && blk.section) copy.section = blk.section;
            if (reps > 1) copy.repeat = `${r + 1}/${reps}`;
          }
          measures.push(copy);
        }));
      }
      b = e;
    }
    // dedos: se eligen en orden para que los cambios de posición sean cómodos.
    // La misma forma puede llevar dedos distintos según de dónde vengas, así que la clave incluye los dedos.
    const occ = [];
    let last = null;
    measures.forEach(m => m.shapes.forEach(inst => { if (inst && inst !== last) occ.push(inst); last = inst; }));
    const chosen = root.Fingering.optimize(occ.map(x => x.frets), opts.fingers || {});
    const chords = {};
    const keys = occ.map((x, i) => {
      const key = x.frets.join(',') + '|' + chosen[i].join('');
      if (!chords[key]) chords[key] = { name: nameChord(x.frets, open), frets: x.frets, fingers: chosen[i] };
      return key;
    });
    let oi = -1, prevKey = null;
    last = null;
    measures.forEach(m => {
      const keyAt = m.shapes.map(inst => {
        if (inst && inst !== last) oi++;
        last = inst;
        return inst ? keys[oi] : null;
      });
      // diagramas donde empieza una forma de acorde; no se repite si es idéntica a la anterior
      const c = {};
      keyAt.forEach((key, k) => {
        if (m.chords[k] && (key !== prevKey || k === 0)) c[k] = key;
        prevKey = key;
      });
      m.shapes = keyAt;
      m.chords = c;
    });
    return { measures, chords, open };
  }

  root.TabParser = { parseAsciiTab, nameChord, parseTuning };
})(typeof window !== 'undefined' ? window : globalThis);
