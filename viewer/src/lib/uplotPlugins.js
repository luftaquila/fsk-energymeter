let shouldSyncX = true;
let shouldSyncY = true;

export function wheelZoomPlugin(opts = {}) {
  const factor = opts.factor || 0.75;
  let xMin, xMax, yMin, yMax, xRange, yRange;

  function clamp(nRange, nMin, nMax, fRange, fMin, fMax) {
    if (nRange > fRange) {
      nMin = fMin;
      nMax = fMax;
    } else if (nMin < fMin) {
      nMin = fMin;
      nMax = fMin + nRange;
    } else if (nMax > fMax) {
      nMax = fMax;
      nMin = fMax - nRange;
    }
    return [nMin, nMax];
  }

  return {
    hooks: {
      setData: () => {
        shouldSyncX = true;
        shouldSyncY = true;
      },
      setScale: (u, key) => {
        if (key == "x" && shouldSyncX) {
          xMin = u.scales.x.min;
          xMax = u.scales.x.max;
          xRange = xMax - xMin;
          shouldSyncX = false;
        }
        if (key == "y" && shouldSyncY) {
          yMin = u.scales.y.min;
          yMax = u.scales.y.max;
          yRange = yMax - yMin;
          shouldSyncY = false;
        }
      },
      ready: (u) => {
        xMin = u.scales.x.min;
        xMax = u.scales.x.max;
        yMin = u.scales.y.min;
        yMax = u.scales.y.max;
        xRange = xMax - xMin;
        yRange = yMax - yMin;
        const over = u.over;

        over.addEventListener("mousedown", (e) => {
          if (e.button == 1) {
            e.preventDefault();
            const left0 = e.clientX,
              scXMin0 = u.scales.x.min,
              scXMax0 = u.scales.x.max;
            const xUnitsPerPx = u.posToVal(1, "x") - u.posToVal(0, "x");
            function onmove(e) {
              e.preventDefault();
              const dx = xUnitsPerPx * (e.clientX - left0);
              u.setScale("x", { min: scXMin0 - dx, max: scXMax0 - dx });
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
          e.preventDefault();
          const rect = over.getBoundingClientRect();
          const mouseX = e.clientX - rect.left,
            mouseY = e.clientY - rect.top;
          const leftPct = mouseX / rect.width,
            btmPct = 1 - mouseY / rect.height;
          const xVal = u.posToVal(mouseX, "x"),
            yVal = u.posToVal(mouseY, "y");
          const oxRange = u.scales.x.max - u.scales.x.min,
            oyRange = u.scales.y.max - u.scales.y.min;
          let nxRange = e.deltaY < 0 ? oxRange * factor : oxRange / factor;
          let nxMin = xVal - leftPct * nxRange,
            nxMax = nxMin + nxRange;
          [nxMin, nxMax] = clamp(nxRange, nxMin, nxMax, xRange, xMin, xMax);
          let nyRange = e.deltaY < 0 ? oyRange * factor : oyRange / factor;
          let nyMin = yVal - btmPct * nyRange,
            nyMax = nyMin + nyRange;
          [nyMin, nyMax] = clamp(nyRange, nyMin, nyMax, yRange, yMin, yMax);
          u.batch(() => {
            u.setScale("x", { min: nxMin, max: nxMax });
            u.setScale("y", { min: nyMin, max: nyMax });
          });
        });
      },
    },
  };
}

export function touchZoomPlugin() {
  function init(u) {
    const over = u.over;
    let rect, oxRange, oyRange, xVal, yVal;
    const fr = { x: 0, y: 0, dx: 0, dy: 0, d: 0 },
      to = { x: 0, y: 0, dx: 0, dy: 0, d: 0 };

    function storePos(t, e) {
      const ts = e.touches,
        t0 = ts[0],
        t0x = t0.clientX - rect.left,
        t0y = t0.clientY - rect.top;
      if (ts.length == 1) {
        t.x = t0x;
        t.y = t0y;
        t.d = t.dx = t.dy = 1;
      } else {
        const t1 = ts[1],
          t1x = t1.clientX - rect.left,
          t1y = t1.clientY - rect.top;
        const xMin = Math.min(t0x, t1x),
          yMin = Math.min(t0y, t1y),
          xMax = Math.max(t0x, t1x),
          yMax = Math.max(t0y, t1y);
        t.y = (yMin + yMax) / 2;
        t.x = (xMin + xMax) / 2;
        t.dx = xMax - xMin;
        t.dy = yMax - yMin;
        t.d = Math.sqrt(t.dx * t.dx + t.dy * t.dy);
      }
    }
    let rafPending = false;
    function zoom() {
      rafPending = false;
      const xFactor = fr.d / to.d,
        yFactor = fr.d / to.d;
      const leftPct = to.x / rect.width,
        btmPct = 1 - to.y / rect.height;
      const nxRange = oxRange * xFactor,
        nxMin = xVal - leftPct * nxRange,
        nxMax = nxMin + nxRange;
      const nyRange = oyRange * yFactor,
        nyMin = yVal - btmPct * nyRange,
        nyMax = nyMin + nyRange;
      u.batch(() => {
        u.setScale("x", { min: nxMin, max: nxMax });
        u.setScale("y", { min: nyMin, max: nyMax });
      });
    }
    function touchmove(e) {
      e.preventDefault();
      storePos(to, e);
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(zoom);
      }
    }
    over.addEventListener("touchstart", (e) => {
      rect = over.getBoundingClientRect();
      storePos(fr, e);
      oxRange = u.scales.x.max - u.scales.x.min;
      oyRange = u.scales.y.max - u.scales.y.min;
      xVal = u.posToVal(fr.x, "x");
      yVal = u.posToVal(fr.y, "y");
      document.addEventListener("touchmove", touchmove, { passive: false });
    });
    over.addEventListener("touchend", () => {
      document.removeEventListener("touchmove", touchmove, { passive: false });
    });
  }
  return { hooks: { init } };
}

export function peakAnnotationsPlugin(resultRef) {
  let powerAnnotation = null,
    voltageAnnotation = null,
    currentAnnotation = null;

  function createAnnotation(value, color, unit, zIndex) {
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;pointer-events:none;z-index:${zIndex}`;
    const box = document.createElement("div");
    box.style.cssText = `background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.2)`;
    box.textContent = `${value.toFixed(1)} ${unit}`;
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
      powerAnnotation = createAnnotation(r.max_power, "mediumorchid", "kW", 1003);
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

  let lastVP = null;
  function checkVP(u) {
    const vp = { xMin: u.scales.x.min, xMax: u.scales.x.max };
    if (!lastVP || lastVP.xMin !== vp.xMin || lastVP.xMax !== vp.xMax) {
      lastVP = vp;
      place(u);
    }
  }

  return {
    hooks: {
      ready: [place],
      setScale: [
        (u, key) => {
          if (["x", "kW", "HV", "A"].includes(key)) {
            if (u._annPending) return;
            u._annPending = true;
            requestAnimationFrame(() => {
              u._annPending = false;
              checkVP(u);
            });
          }
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
