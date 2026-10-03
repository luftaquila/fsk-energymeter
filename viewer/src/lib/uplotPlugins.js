// narrowest x window (ms), about 5 records at 100 Hz; also keeps zoom clear of float precision limits
export const MIN_X_RANGE = 50;

// x scale range for every zoom/pan path (wheel, touch, drag select, middle-button pan):
// keeps the view inside the data and no narrower than MIN_X_RANGE
export function limitXRange(u, min, max) {
  if (min == null || max == null) return [null, null];
  const ts = u.data[0];
  if (!ts?.length || ts[ts.length - 1] - ts[0] <= MIN_X_RANGE) return [min, max];
  const lo = ts[0],
    hi = ts[ts.length - 1];
  let range = max - min;
  if (range >= hi - lo) return [lo, hi];
  if (range < MIN_X_RANGE) {
    const mid = (min + max) / 2;
    range = MIN_X_RANGE;
    min = mid - range / 2;
    max = mid + range / 2;
  }
  if (min < lo) return [lo, lo + range];
  if (max > hi) return [hi - range, hi];
  return [min, max];
}

export function wheelZoomPlugin(opts = {}) {
  const factor = opts.factor || 0.75;

  return {
    hooks: {
      ready: (u) => {
        const over = u.over;

        over.addEventListener("mousedown", (e) => {
          if (e.button == 1) {
            e.preventDefault();
            let left0 = e.clientX;
            const xUnitsPerPx = u.posToVal(1, "x") - u.posToVal(0, "x");
            // pan by the movement since the last event so the view follows back right away after stopping at a data edge
            function onmove(e) {
              e.preventDefault();
              const dx = xUnitsPerPx * (e.clientX - left0);
              left0 = e.clientX;
              u.setScale("x", { min: u.scales.x.min - dx, max: u.scales.x.max - dx });
            }
            function onup() {
              document.removeEventListener("mousemove", onmove);
              document.removeEventListener("mouseup", onup);
            }
            document.addEventListener("mousemove", onmove);
            document.addEventListener("mouseup", onup);
          }
        });

        over.addEventListener("wheel", (e) => {
          // consume every wheel event, so horizontal trackpad swipes don't reach the browser as back/forward navigation
          e.preventDefault();
          // mostly horizontal swipes are not zoom gestures
          if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
          const rect = over.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const leftPct = mouseX / rect.width;
          const xVal = u.posToVal(mouseX, "x");
          // pixel deltas (trackpads, smooth scrolling) zoom in proportion; a 100px notch or a line/page step zooms by `factor`
          const steps = e.deltaMode == 0 ? Math.max(-1, Math.min(1, e.deltaY / 100)) : Math.sign(e.deltaY);
          const nxRange = Math.max(MIN_X_RANGE, (u.scales.x.max - u.scales.x.min) * factor ** -steps);
          const nxMin = xVal - leftPct * nxRange;
          u.setScale("x", { min: nxMin, max: nxMin + nxRange });
        });
      },
    },
  };
}

export function touchZoomPlugin() {
  function init(u) {
    const over = u.over;
    let rect, oxRange, xVal, fr, to;
    let rafPending = false;

    // midpoint and spread of the first two touches, keyed by which fingers they are
    function getPos(e) {
      const ts = e.touches,
        t0 = ts[0];
      if (ts.length == 1) return { key: `${t0.identifier}`, x: t0.clientX - rect.left, d: 1 };
      const t1 = ts[1];
      return {
        key: `${t0.identifier},${t1.identifier}`,
        x: (t0.clientX + t1.clientX) / 2 - rect.left,
        d: Math.max(1, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)),
      };
    }
    // (re)starts the gesture from the current view
    function begin(e) {
      zoom(); // apply movement still pending for the previous fingers
      rect = over.getBoundingClientRect();
      fr = to = getPos(e);
      oxRange = u.scales.x.max - u.scales.x.min;
      xVal = u.posToVal(fr.x, "x");
    }
    function zoom() {
      if (!rafPending) return;
      rafPending = false;
      const reqRange = (oxRange * fr.d) / to.d,
        nxRange = Math.max(MIN_X_RANGE, reqRange),
        nxMin = xVal - (to.x / rect.width) * nxRange,
        nxMax = nxMin + nxRange;
      // batch commits right away, so the scale read below is already updated
      u.batch(() => u.setScale("x", { min: nxMin, max: nxMax }));
      // view hit a limit: continue from where it stopped instead of building up overshoot
      if (reqRange < MIN_X_RANGE || u.scales.x.min != nxMin || u.scales.x.max != nxMax) {
        fr = to;
        oxRange = u.scales.x.max - u.scales.x.min;
        xVal = u.posToVal(fr.x, "x");
      }
    }
    function touchmove(e) {
      e.preventDefault();
      const pos = getPos(e);
      // a finger was added outside the plot, where no touchstart reaches over
      if (pos.key != fr.key) return begin(e);
      to = pos;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(zoom);
      }
    }
    // on document, so fingers that started outside the plot also end the gesture; remaining fingers carry it on
    function touchend(e) {
      if (e.touches.length) return begin(e);
      document.removeEventListener("touchmove", touchmove, { passive: false });
      document.removeEventListener("touchend", touchend);
      document.removeEventListener("touchcancel", touchend);
    }
    over.addEventListener("touchstart", (e) => {
      begin(e);
      document.addEventListener("touchmove", touchmove, { passive: false });
      document.addEventListener("touchend", touchend);
      document.addEventListener("touchcancel", touchend);
    });
  }
  return { hooks: { init } };
}

export function peakAnnotationsPlugin(resultRef) {
  let powerAnnotation = null,
    voltageAnnotation = null,
    currentAnnotation = null;

  function createAnnotation(value, color, unit, zIndex, digits = 1) {
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;pointer-events:none;z-index:${zIndex}`;
    const box = document.createElement("div");
    box.style.cssText = `background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.2)`;
    box.textContent = `${value.toFixed(digits)} ${unit}`;
    const arrow = document.createElement("div");
    arrow.style.cssText = `position:absolute;top:100%;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color}`;
    box.appendChild(arrow);
    el.appendChild(box);
    return el;
  }

  function isInView(u, ts, val, scale) {
    return ts >= u.scales.x.min && ts <= u.scales.x.max && val >= u.scales[scale].min && val <= u.scales[scale].max;
  }

  function place(u) {
    [powerAnnotation, voltageAnnotation, currentAnnotation].forEach((a) => a?.remove());
    powerAnnotation = voltageAnnotation = currentAnnotation = null;
    const r = resultRef.value;
    if (!r) return;

    if (
      u.series[3].show &&
      r.max_power_timestamp &&
      r.max_power &&
      isInView(u, r.max_power_timestamp, r.max_power, "kW")
    ) {
      powerAnnotation = createAnnotation(r.max_power, "mediumorchid", "kW", 1003, 3);
      u.over.appendChild(powerAnnotation);
      const rect = powerAnnotation.getBoundingClientRect();
      powerAnnotation.style.left = `${u.valToPos(r.max_power_timestamp, "x") - rect.width / 2}px`;
      powerAnnotation.style.top = `${u.valToPos(r.max_power, "kW") - rect.height - 10}px`;
    }
    if (
      u.series[1].show &&
      r.max_voltage_timestamp &&
      r.max_voltage &&
      isInView(u, r.max_voltage_timestamp, r.max_voltage, "HV")
    ) {
      voltageAnnotation = createAnnotation(r.max_voltage, "red", "V", 1002);
      u.over.appendChild(voltageAnnotation);
      const rect = voltageAnnotation.getBoundingClientRect();
      voltageAnnotation.style.left = `${u.valToPos(r.max_voltage_timestamp, "x") - rect.width / 2}px`;
      voltageAnnotation.style.top = `${u.valToPos(r.max_voltage, "HV") - rect.height - 10}px`;
    }
    if (
      u.series[2].show &&
      r.max_current_timestamp &&
      r.max_current &&
      isInView(u, r.max_current_timestamp, r.max_current, "A")
    ) {
      currentAnnotation = createAnnotation(r.max_current, "dodgerblue", "A", 1001);
      u.over.appendChild(currentAnnotation);
      const rect = currentAnnotation.getBoundingClientRect();
      currentAnnotation.style.left = `${u.valToPos(r.max_current_timestamp, "x") - rect.width / 2}px`;
      currentAnnotation.style.top = `${u.valToPos(r.max_current, "A") - rect.height - 10}px`;
    }
  }

  // positions depend on every scale, the plot size, series visibility and the peak values themselves
  let pending = false;
  function schedule(u) {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      place(u);
    });
  }

  return {
    hooks: {
      ready: [place],
      setData: [schedule],
      setSize: [schedule],
      setSeries: [schedule],
      setScale: [
        (u, key) => {
          if (["x", "kW", "HV", "A"].includes(key)) schedule(u);
        },
      ],
    },
  };
}

export function violationVisibilityPlugin() {
  return {
    hooks: {
      setSeries: [
        (u, idx, opts) => {
          if (idx === 3) {
            [6, 7].forEach((i) => {
              if (u.series[i]?.show !== opts.show) u.setSeries(i, { show: opts.show });
            });
          }
        },
      ],
      ready: [
        (u) => {
          const show = u.series[3].show;
          u.setSeries(6, { show });
          u.setSeries(7, { show });
          const rows = u.root.querySelectorAll(".u-legend tr");
          if (rows[6]) rows[6].style.display = "none";
          if (rows[7]) rows[7].style.display = "none";
        },
      ],
    },
  };
}

export async function downloadImage(uplot, filename) {
  const html2canvas = (await import("html2canvas")).default;

  // Hide legend temporarily
  const legendEl = uplot.root.querySelector(".u-legend");
  const originalLegendDisplay = legendEl ? legendEl.style.display : null;
  if (legendEl) {
    legendEl.style.display = "none";
  }

  try {
    // Capture the entire uplot root element with higher resolution
    const canvas = await html2canvas(uplot.root, {
      backgroundColor: "#ffffff",
      scale: 3, // Higher resolution (3x)
      useCORS: true,
      logging: false,
      width: uplot.root.offsetWidth,
      height: uplot.root.offsetHeight,
    });

    // Restore legend visibility
    if (legendEl) {
      legendEl.style.display = originalLegendDisplay;
    }

    // Download the image
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename + ".png";
    a.click();
  } catch (error) {
    // Restore legend visibility on error
    if (legendEl) {
      legendEl.style.display = originalLegendDisplay;
    }

    console.error("Failed to export image:", error);
    // Fallback: just use the canvas
    const pxRatio = devicePixelRatio;
    const rootRect = uplot.root.getBoundingClientRect();
    const canvasRect = uplot.ctx.canvas.getBoundingClientRect();

    const width = Math.ceil(rootRect.width * pxRatio);
    const height = Math.ceil(rootRect.height * pxRatio);

    const can = document.createElement("canvas");
    const ctx = can.getContext("2d");
    can.width = width;
    can.height = height;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, can.width, can.height);

    const canvasOffsetY = (canvasRect.top - rootRect.top) * pxRatio;
    ctx.drawImage(uplot.ctx.canvas, 0, canvasOffsetY);

    const a = document.createElement("a");
    a.href = can.toDataURL("image/png");
    a.download = filename + ".png";
    a.click();
  }
}
