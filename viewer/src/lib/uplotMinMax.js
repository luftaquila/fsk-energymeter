import uPlot from "./uplot/dist/uPlot.esm.js";

// uPlot ranges y scales and builds line paths by walking every visible record on each redraw. min/max pyramids
// built once per data array make both follow the plot width instead, so wide views of long logs stay responsive

// records per block in the first pyramid level
const BASE = 8;
// below this many records per pixel uPlot's own path is as fast
const MIN_RECORDS_PER_PX = 16;

const pyramids = new WeakMap();
const nonNulls = new WeakMap();
const sorted = new WeakMap();

function cached(map, key, build) {
  let v = map.get(key);
  if (v === undefined) {
    v = build(key);
    map.set(key, v);
  }
  return v;
}

// level l holds the min and max of each aligned block of BASE << l records; null for data with gaps
function buildPyramid(ys) {
  const n = ys.length;
  if (n < BASE * 2) return null;
  for (let i = 0; i < n; i++) if (ys[i] == null) return null;

  let len = Math.ceil(n / BASE),
    mn = new Float64Array(len),
    mx = new Float64Array(len);
  for (let b = 0; b < len; b++) {
    let lo = ys[b * BASE],
      hi = lo;
    for (let i = b * BASE + 1, e = Math.min(n, (b + 1) * BASE); i < e; i++) {
      if (ys[i] < lo) lo = ys[i];
      else if (ys[i] > hi) hi = ys[i];
    }
    mn[b] = lo;
    mx[b] = hi;
  }

  const levels = [{ mn, mx }];
  while (len > 1) {
    const pmn = mn,
      pmx = mx,
      plen = len;
    len = Math.ceil(plen / 2);
    mn = new Float64Array(len);
    mx = new Float64Array(len);
    for (let b = 0; b < len; b++) {
      const j = Math.min(2 * b + 1, plen - 1);
      mn[b] = Math.min(pmn[2 * b], pmn[j]);
      mx[b] = Math.max(pmx[2 * b], pmx[j]);
    }
    levels.push({ mn, mx });
  }
  return levels;
}

function buildNonNull(ys) {
  const idxs = [];
  for (let i = 0; i < ys.length; i++) if (ys[i] != null) idxs.push(i);
  return idxs;
}

function isSorted(xs) {
  for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1]) return false;
  return true;
}

// first position in ascending arr whose value is not below v
function lowerBound(arr, v) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// last index in [lo, hi] whose x is below v, or lo
function lastBelow(xs, v, lo, hi) {
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] < v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// [min, max] of the values of ys in [i0, i1]; [Infinity, -Infinity] when none has a value
function rangeMinMax(ys, i0, i1) {
  let lo = Infinity,
    hi = -Infinity;
  const p = cached(pyramids, ys, buildPyramid);

  if (!p) {
    // data with gaps, such as the violation markers: only walk the records that have a value
    const idxs = cached(nonNulls, ys, buildNonNull);
    for (let k = lowerBound(idxs, i0); k < idxs.length && idxs[k] <= i1; k++) {
      const v = ys[idxs[k]];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }

  // records outside whole blocks at both ends, then the fewest blocks that cover the rest
  let a = i0,
    b = i1;
  for (; a <= b && a % BASE; a++) {
    if (ys[a] < lo) lo = ys[a];
    if (ys[a] > hi) hi = ys[a];
  }
  for (; b >= a && (b + 1) % BASE; b--) {
    if (ys[b] < lo) lo = ys[b];
    if (ys[b] > hi) hi = ys[b];
  }
  for (let l = 0, s = a / BASE, e = (b + 1) / BASE - 1; s <= e; l++, s >>= 1, e >>= 1) {
    const { mn, mx } = p[l];
    if (s & 1) {
      if (mn[s] < lo) lo = mn[s];
      if (mx[s] > hi) hi = mx[s];
      s++;
    }
    if (!(e & 1)) {
      if (mn[e] < lo) lo = mn[e];
      if (mx[e] > hi) hi = mx[e];
      e--;
    }
  }
  return [lo, hi];
}

// data min and max of the shown series on scale `key` within the x view, as uPlot's auto ranging finds them.
// for scale range functions; the series on the scale need auto: false so uPlot skips its own scan
export function visibleMinMax(u, key) {
  const [i0, i1] = u.series[0].idxs;
  let lo = Infinity,
    hi = -Infinity;
  if (u.data?.[0]?.length && i0 != null && i1 != null) {
    for (let i = 1; i < u.series.length; i++) {
      const s = u.series[i];
      if (!s.show || s.scale != key) continue;
      const [a, b] = rangeMinMax(u.data[i], i0, i1);
      if (a < lo) lo = a;
      if (b > hi) hi = b;
    }
  }
  return lo <= hi ? [lo, hi] : [null, null];
}

// points.filter for sparse series: the records in view that have a value, without walking every record
export function visibleNonNull(u, si) {
  const [i0, i1] = u.series[0].idxs;
  const idxs = cached(nonNulls, u.data[si], buildNonNull);
  return idxs.slice(lowerBound(idxs, i0), lowerBound(idxs, i1 + 1));
}

// same path as uPlot's decimating linear builder, but each pixel column is found by binary search
// and ranged by the pyramid instead of walking its records
export function minMaxLinear() {
  const linear = uPlot.paths.linear();

  return (u, si, idx0, idx1) => {
    const xs = u.data[0],
      ys = u.data[si],
      sx = u.scales.x,
      xDim = u.bbox.width;
    if (
      idx1 - idx0 < xDim * MIN_RECORDS_PER_PX ||
      sx.ori != 0 ||
      sx.dir != 1 ||
      !cached(sorted, xs, isSorted) ||
      !cached(pyramids, ys, buildPyramid)
    )
      return linear(u, si, idx0, idx1);

    const sy = u.scales[u.series[si].scale],
      round = u.series[si].pxRound,
      { left, top, height } = u.bbox;
    const px = (v) => round(u.valToPosH(v, sx, xDim, left));
    const py = (v) => round(u.valToPosV(v, sy, height, top));
    const stroke = new Path2D();

    for (let i = idx0; i <= idx1; ) {
      // a column holds the records from i up to where the next pixel starts, as in uPlot
      const x = px(xs[i]);
      const j = lastBelow(xs, u.posToVal(x + 1, "x", true), i, idx1);
      const [lo, hi] = rangeMinMax(ys, i, j);
      const pIn = py(ys[i]),
        pOut = py(ys[j]),
        pMin = py(lo),
        pMax = py(hi);
      stroke.lineTo(x, pIn);
      if (pMin != pMax) {
        if (pIn != pMin && pOut != pMin) stroke.lineTo(x, pMin);
        if (pIn != pMax && pOut != pMax) stroke.lineTo(x, pMax);
        stroke.lineTo(x, pOut);
      }
      i = j + 1;
    }

    // BAND_CLIP_FILL, as uPlot's builders set it
    return { stroke, fill: null, clip: null, band: null, gaps: null, flags: 1 };
  };
}
