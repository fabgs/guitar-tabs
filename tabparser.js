// Convierte un tab ASCII (estilo Ultimate Guitar) al formato de la app:
//   { measures: [{ section, notes: ['A5 G6 B7', ...], chords: { slot: key } }], chords: { key: shape } }
// - Cada grupo de notas separadas por 2 guiones = medio compás (4 corcheas).
// - Un hueco de 3+ guiones empieza un grupo nuevo.
// - Marcas tipo ")x3" a la derecha del bloque lo repiten.
// - El acorde y los dedos de la mano izquierda se calculan por cada medio compás.
(function (root) {
  const STR = ['E', 'A', 'D', 'G', 'B', 'e'];
  const OPEN = [40, 45, 50, 55, 59, 64];
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const TEMPLATES = [
    ['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]],
    ['dim', [0, 3, 6]], ['dim7', [0, 3, 6, 9]], ['m7b5', [0, 3, 6, 10]], ['aug', [0, 4, 8]],
    ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]],
    ['add9', [0, 2, 4, 7]], ['madd9', [0, 2, 3, 7]], ['9', [0, 2, 4, 7, 10]], ['maj9', [0, 2, 4, 7, 11]],
    ['m9', [0, 2, 3, 7, 10]], ['7sus4', [0, 5, 7, 10]], ['6/9', [0, 2, 4, 7, 9]], ['m(maj7)', [0, 3, 7, 11]],
    ['5', [0, 7]],
  ];

  function nameChord(frets) {
    const midis = [];
    frets.forEach((f, s) => { if (typeof f === 'number') midis.push(OPEN[s] + f); });
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

  // Dedos 1–4 para una forma. Una nota por traste, cejilla con el índice si hace falta.
  function fingerShape(frets) {
    const fingers = [0, 0, 0, 0, 0, 0];
    const fretted = [];
    frets.forEach((f, s) => { if (typeof f === 'number' && f > 0) fretted.push({ s, f }); });
    if (!fretted.length) return fingers;
    const minF = Math.min(...fretted.map(n => n.f));
    const maxF = Math.max(...fretted.map(n => n.f));
    const atMin = fretted.filter(n => n.f === minF).length;
    const byFret = [...new Set(fretted.map(n => n.f))].sort((a, b) => a - b);
    // devuelve dedos o null si hacen falta más de 4
    function assign(base, barre) {
      const out = [0, 0, 0, 0, 0, 0];
      let next = 1;
      for (const f of byFret) {
        const ns = fretted.filter(n => n.f === f).sort((a, b) => a.s - b.s);
        if (f === minF && barre) { ns.forEach(n => out[n.s] = 1); next = 2; continue; }
        let fg = Math.max(next, Math.min(f - base + 1, 5 - ns.length));
        for (const n of ns) { if (fg > 4) return null; out[n.s] = fg++; }
        next = fg;
      }
      return out;
    }
    const tries = [];
    if (atMin >= 2 && fretted.length >= 4) tries.push([minF, true]);
    if (maxF <= 4) tries.push([1, false]);            // primera posición: dedo = traste
    tries.push([minF, false]);
    if (atMin >= 2) tries.push([minF, true]);
    for (const [b, br] of tries) { const r = assign(b, br); if (r) return r; }
    return fingers;
  }

  function parseBlock(lines) {
    // lines: 6 strings e..E -> devuelve eventos [{pos, notes:[{s,f}]}]
    const events = new Map();
    lines.forEach((ln, li) => {
      const s = 5 - li;
      for (let i = 0; i < ln.length; i++) {
        if (/\d/.test(ln[i])) {
          let j = i; while (j + 1 < ln.length && /\d/.test(ln[j + 1])) j++;
          const f = parseInt(ln.slice(i, j + 1), 10);
          if (!events.has(i)) events.set(i, []);
          events.get(i).push({ s, f });
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

  function parseAsciiTab(text) {
    const lines = text.split(/\r?\n/);
    const measures = [], chords = {};
    const blocks = [];
    let section = null;
    const re = /^\s*([eBGDAE])\|(.*)$/;
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(/^\s*\[(.+)\]\s*$/);
      if (h) { section = h[1]; continue; }
      const rm = lines[i].match(/^\s*\)\s*x\s*(\d+)/i);   // ") x2" suelto entre bloques
      if (rm && blocks.length) { blocks[blocks.length - 1].reps = Math.max(blocks[blocks.length - 1].reps, +rm[1]); continue; }
      const order = ['e', 'B', 'G', 'D', 'A', 'E'];
      const blk = order.map((n, k) => { const m = (lines[i + k] || '').match(re); return m && m[1] === n ? m[2] : null; });
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
      // cada grupo se trocea en medios compases de 4 corcheas
      const halves = [];
      for (const g of groupEvents(parseBlock(content)))
        for (let k = 0; k < g.length; k += 4) halves.push(g.slice(k, k + 4));
      const blockMeasures = [];
      let cur = null, prevFrets = null;
      for (const g of halves) {
        if (!cur || cur.notes.length >= 8) { cur = { notes: [], chords: {} }; blockMeasures.push(cur); }
        if (!(prevFrets && fitsShape(g, prevFrets))) {
          const frets = shapeOf(g);
          const key = frets.join(',');
          if (!chords[key]) chords[key] = { name: nameChord(frets), frets, fingers: fingerShape(frets) };
          cur.chords[cur.notes.length] = key;
          prevFrets = frets;
        }
        g.forEach(sl => cur.notes.push(sl.map(n => STR[n.s] + n.f).join(' ')));
      }
      blocks.push({ section, measures: blockMeasures, reps, paren });
      section = null;
    }
    // expandir repeticiones: bloques seguidos marcados con ")" forman un grupo
    for (let b = 0; b < blocks.length; b++) {
      let e = b;
      if (blocks[b].paren) while (e + 1 < blocks.length && blocks[e + 1].paren && !blocks[e + 1].section) e++;
      const grp = blocks.slice(b, e + 1);
      const reps = Math.max(...grp.map(x => x.reps));
      for (let r = 0; r < reps; r++) {
        grp.forEach((blk, bi) => blk.measures.forEach((m, k) => {
          const copy = { notes: m.notes, chords: { ...m.chords } };
          if (bi === 0 && k === 0) {
            if (r === 0 && blk.section) copy.section = blk.section;
            if (reps > 1) copy.repeat = `${r + 1}/${reps}`;
          }
          measures.push(copy);
        }));
      }
      b = e;
    }
    // quitar el acorde repetido si no cambia
    let prev = null;
    measures.forEach(m => {
      const c = {};
      for (const k of Object.keys(m.chords).map(Number).sort((a, b) => a - b)) {
        if (m.chords[k] !== prev || +k === 0) c[k] = m.chords[k];
        prev = m.chords[k];
      }
      m.chords = c;
    });
    return { measures, chords };
  }

  root.TabParser = { parseAsciiTab, nameChord, fingerShape };
})(typeof window !== 'undefined' ? window : globalThis);
