function wheelZoomPlugin(opts) {
  let factor = opts.factor || 0.75;

  let xMin, xMax, yMin, yMax, xRange, yRange;

  function clamp(nRange, nMin, nMax, fRange, fMin, fMax) {
    if (nRange > fRange) {
      nMin = fMin;
      nMax = fMax;
    }
    else if (nMin < fMin) {
      nMin = fMin;
      nMax = fMin + nRange;
    }
    else if (nMax > fMax) {
      nMax = fMax;
      nMin = fMax - nRange;
    }

    return [nMin, nMax];
  }

  return {
    hooks: {
      setData: u => {
        shouldSyncX = true;
        shouldSyncY = true;
      },
      setScale: (u, key) => {
        if (key == 'x' && shouldSyncX) {
          xMin = u.scales.x.min;
          xMax = u.scales.x.max;
          xRange = xMax - xMin;
          shouldSyncX = false;
        }

        if (key == 'y' && shouldSyncY) {
          yMin = u.scales.y.min;
          yMax = u.scales.y.max;
          yRange = yMax - yMin;
          shouldSyncY = false;
        }
      },
      ready: u => {
        xMin = u.scales.x.min;
        xMax = u.scales.x.max;
        yMin = u.scales.y.min;
        yMax = u.scales.y.max;

        xRange = xMax - xMin;
        yRange = yMax - yMin;

        let over = u.over;
        let rect = over.getBoundingClientRect();

        // wheel drag pan
        over.addEventListener("mousedown", e => {
          if (e.button == 1) {
            //	plot.style.cursor = "move";
            e.preventDefault();

            let left0 = e.clientX;
            //	let top0 = e.clientY;

            let scXMin0 = u.scales.x.min;
            let scXMax0 = u.scales.x.max;

            let xUnitsPerPx = u.posToVal(1, 'x') - u.posToVal(0, 'x');

            function onmove(e) {
              e.preventDefault();

              let left1 = e.clientX;
              //	let top1 = e.clientY;

              let dx = xUnitsPerPx * (left1 - left0);

              u.setScale('x', {
                min: scXMin0 - dx,
                max: scXMax0 - dx,
              });
            }

            function onup(e) {
              document.removeEventListener("mousemove", onmove);
              document.removeEventListener("mouseup", onup);
            }

            document.addEventListener("mousemove", onmove);
            document.addEventListener("mouseup", onup);
          }
        });

        // wheel scroll zoom
        over.addEventListener("wheel", e => {
          e.preventDefault();

          // Update rect for accurate cursor position calculation
          rect = over.getBoundingClientRect();
          
          let { left, top } = u.cursor;

          let leftPct = left / rect.width;
          let btmPct = 1 - top / rect.height;
          let xVal = u.posToVal(left, "x");
          let yVal = u.posToVal(top, "y");
          let oxRange = u.scales.x.max - u.scales.x.min;
          let oyRange = u.scales.y.max - u.scales.y.min;

          let nxRange = e.deltaY < 0 ? oxRange * factor : oxRange / factor;
          let nxMin = xVal - leftPct * nxRange;
          let nxMax = nxMin + nxRange;
          [nxMin, nxMax] = clamp(nxRange, nxMin, nxMax, xRange, xMin, xMax);

          let nyRange = e.deltaY < 0 ? oyRange * factor : oyRange / factor;
          let nyMin = yVal - btmPct * nyRange;
          let nyMax = nyMin + nyRange;
          [nyMin, nyMax] = clamp(nyRange, nyMin, nyMax, yRange, yMin, yMax);

          u.batch(() => {
            u.setScale("x", {
              min: nxMin,
              max: nxMax,
            });

            u.setScale("y", {
              min: nyMin,
              max: nyMax,
            });
          });
        });
      }
    }
  };
}

function touchZoomPlugin(opts) {
  function init(u, opts, data) {
    let over = u.over;
    let rect, oxRange, oyRange, xVal, yVal;
    let fr = { x: 0, y: 0, dx: 0, dy: 0 };
    let to = { x: 0, y: 0, dx: 0, dy: 0 };

    function storePos(t, e) {
      let ts = e.touches;

      let t0 = ts[0];
      let t0x = t0.clientX - rect.left;
      let t0y = t0.clientY - rect.top;

      if (ts.length == 1) {
        t.x = t0x;
        t.y = t0y;
        t.d = t.dx = t.dy = 1;
      }
      else {
        let t1 = e.touches[1];
        let t1x = t1.clientX - rect.left;
        let t1y = t1.clientY - rect.top;

        let xMin = Math.min(t0x, t1x);
        let yMin = Math.min(t0y, t1y);
        let xMax = Math.max(t0x, t1x);
        let yMax = Math.max(t0y, t1y);

        // midpts
        t.y = (yMin + yMax) / 2;
        t.x = (xMin + xMax) / 2;

        t.dx = xMax - xMin;
        t.dy = yMax - yMin;

        // dist
        t.d = Math.sqrt(t.dx * t.dx + t.dy * t.dy);
      }
    }

    let rafPending = false;

    function zoom() {
      rafPending = false;

      let left = to.x;
      let top = to.y;

      // non-uniform scaling
      //	let xFactor = fr.dx / to.dx;
      //	let yFactor = fr.dy / to.dy;

      // uniform x/y scaling
      let xFactor = fr.d / to.d;
      let yFactor = fr.d / to.d;

      let leftPct = left / rect.width;
      let btmPct = 1 - top / rect.height;

      let nxRange = oxRange * xFactor;
      let nxMin = xVal - leftPct * nxRange;
      let nxMax = nxMin + nxRange;

      let nyRange = oyRange * yFactor;
      let nyMin = yVal - btmPct * nyRange;
      let nyMax = nyMin + nyRange;

      u.batch(() => {
        u.setScale("x", {
          min: nxMin,
          max: nxMax,
        });

        u.setScale("y", {
          min: nyMin,
          max: nyMax,
        });
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

    over.addEventListener("touchstart", function (e) {
      rect = over.getBoundingClientRect();

      storePos(fr, e);

      oxRange = u.scales.x.max - u.scales.x.min;
      oyRange = u.scales.y.max - u.scales.y.min;

      let left = fr.x;
      let top = fr.y;

      xVal = u.posToVal(left, "x");
      yVal = u.posToVal(top, "y");

      document.addEventListener("touchmove", touchmove, { passive: false });
    });

    over.addEventListener("touchend", function (e) {
      document.removeEventListener("touchmove", touchmove, { passive: false });
    });
  }

  return {
    hooks: {
      init,
    }
  };
}

function peakAnnotationsPlugin() {
  let powerAnnotation = null;
  let voltageAnnotation = null;
  let currentAnnotation = null;

  function createPeakAnnotation(timestamp, value, label, color, scale, unit, zIndex) {
    // Create annotation container
    const annotation = document.createElement('div');
    annotation.style.position = 'absolute';
    annotation.style.pointerEvents = 'none';
    annotation.style.zIndex = zIndex;

    // Create the tooltip box
    const tooltipBox = document.createElement('div');
    tooltipBox.style.background = color;
    tooltipBox.style.color = 'white';
    tooltipBox.style.padding = '4px 8px';
    tooltipBox.style.borderRadius = '4px';
    tooltipBox.style.fontSize = '12px';
    tooltipBox.style.fontWeight = 'bold';
    tooltipBox.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
    tooltipBox.textContent = `${value.toFixed(1)} ${unit}`;

    // Create the arrow pointing down to the data point
    const arrow = document.createElement('div');
    arrow.style.position = 'absolute';
    arrow.style.top = '100%';
    arrow.style.left = '50%';
    arrow.style.transform = 'translateX(-50%)';
    arrow.style.width = '0';
    arrow.style.height = '0';
    arrow.style.borderLeft = '6px solid transparent';
    arrow.style.borderRight = '6px solid transparent';
    arrow.style.borderTop = `6px solid ${color}`;

    // Assemble the annotation
    tooltipBox.appendChild(arrow);
    annotation.appendChild(tooltipBox);

    return annotation;
  }

  function isPointInViewport(u, timestamp, value, scale) {
    // Check if the point is within the current visible range
    const xMin = u.scales.x.min;
    const xMax = u.scales.x.max;
    const yMin = u.scales[scale].min;
    const yMax = u.scales[scale].max;
    
    return timestamp >= xMin && timestamp <= xMax && value >= yMin && value <= yMax;
  }

  function placePeakAnnotations(u) {
    // Remove existing annotations
    if (powerAnnotation) {
      powerAnnotation.remove();
      powerAnnotation = null;
    }
    if (voltageAnnotation) {
      voltageAnnotation.remove();
      voltageAnnotation = null;
    }
    if (currentAnnotation) {
      currentAnnotation.remove();
      currentAnnotation = null;
    }

    if (!window.result) return;

    // Power annotation (series index 3)
    if (u.series[3].show && window.result.max_power_timestamp && window.result.max_power) {
      // Only show if the peak point is within the visible viewport
      if (isPointInViewport(u, window.result.max_power_timestamp, window.result.max_power, 'kW')) {
        powerAnnotation = createPeakAnnotation(window.result.max_power_timestamp, window.result.max_power, 'P', 'mediumorchid', 'kW', 'kW', 1003);

        const xPos = u.valToPos(window.result.max_power_timestamp, 'x');
        const yPos = u.valToPos(window.result.max_power, 'kW');
        u.over.appendChild(powerAnnotation);
        
        // Position tooltip centered on the data point
        const tooltipRect = powerAnnotation.getBoundingClientRect();
        const overlayRect = u.over.getBoundingClientRect();
        powerAnnotation.style.left = `${xPos - tooltipRect.width / 2}px`;
        powerAnnotation.style.top = `${yPos - tooltipRect.height - 10}px`;
      }
    }

    // Voltage annotation (series index 1)
    if (u.series[1].show && window.result.max_voltage_timestamp && window.result.max_voltage) {
      // Only show if the peak point is within the visible viewport
      if (isPointInViewport(u, window.result.max_voltage_timestamp, window.result.max_voltage, 'HV')) {
        voltageAnnotation = createPeakAnnotation(window.result.max_voltage_timestamp, window.result.max_voltage, 'V', 'red', 'HV', 'V', 1002);

        const xPos = u.valToPos(window.result.max_voltage_timestamp, 'x');
        const yPos = u.valToPos(window.result.max_voltage, 'HV');
        u.over.appendChild(voltageAnnotation);
        
        // Position tooltip centered on the data point
        const tooltipRect = voltageAnnotation.getBoundingClientRect();
        voltageAnnotation.style.left = `${xPos - tooltipRect.width / 2}px`;
        voltageAnnotation.style.top = `${yPos - tooltipRect.height - 10}px`;
      }
    }

    // Current annotation (series index 2)
    if (u.series[2].show && window.result.max_current_timestamp && window.result.max_current) {
      // Only show if the peak point is within the visible viewport
      if (isPointInViewport(u, window.result.max_current_timestamp, window.result.max_current, 'A')) {
        currentAnnotation = createPeakAnnotation(window.result.max_current_timestamp, window.result.max_current, 'A', 'dodgerblue', 'A', 'A', 1001);

        const xPos = u.valToPos(window.result.max_current_timestamp, 'x');
        const yPos = u.valToPos(window.result.max_current, 'A');
        u.over.appendChild(currentAnnotation);
        
        // Position tooltip centered on the data point
        const tooltipRect = currentAnnotation.getBoundingClientRect();
        currentAnnotation.style.left = `${xPos - tooltipRect.width / 2}px`;
        currentAnnotation.style.top = `${yPos - tooltipRect.height - 10}px`;
      }
    }
  }

  let lastViewport = null;

  function checkViewportChange(u) {
    const currentViewport = {
      xMin: u.scales.x.min,
      xMax: u.scales.x.max,
      powerYMin: u.scales.kW ? u.scales.kW.min : null,
      powerYMax: u.scales.kW ? u.scales.kW.max : null,
      voltageYMin: u.scales.HV ? u.scales.HV.min : null,
      voltageYMax: u.scales.HV ? u.scales.HV.max : null,
      currentYMin: u.scales.A ? u.scales.A.min : null,
      currentYMax: u.scales.A ? u.scales.A.max : null
    };

    // Only update if viewport actually changed
    if (!lastViewport || 
        lastViewport.xMin !== currentViewport.xMin ||
        lastViewport.xMax !== currentViewport.xMax ||
        lastViewport.powerYMin !== currentViewport.powerYMin ||
        lastViewport.powerYMax !== currentViewport.powerYMax ||
        lastViewport.voltageYMin !== currentViewport.voltageYMin ||
        lastViewport.voltageYMax !== currentViewport.voltageYMax ||
        lastViewport.currentYMin !== currentViewport.currentYMin ||
        lastViewport.currentYMax !== currentViewport.currentYMax) {
      
      lastViewport = currentViewport;
      placePeakAnnotations(u);
    }
  }

  return {
    hooks: {
      ready: [placePeakAnnotations],
      setScale: [
        (u, key) => {
          // Only update annotations when scale changes (zoom/pan)
          if (key === 'x' || key === 'kW' || key === 'HV' || key === 'A') {
            // Use requestAnimationFrame to debounce rapid scale changes
            if (u._annotationUpdatePending) return;
            u._annotationUpdatePending = true;
            
            requestAnimationFrame(() => {
              u._annotationUpdatePending = false;
              checkViewportChange(u);
            });
          }
        }
      ]
    },
  };
}

function violationVisibilityPlugin() {
  return {
    hooks: {
      setSeries: [
        (u, seriesIdx, opts) => {
          // If power series (index 3) visibility changes, sync violation series (index 6 and 7)
          if (seriesIdx === 3) {
            const violation100msIdx = 6;
            const violation500msIdx = 7;
            
            if (u.series[violation100msIdx] && u.series[violation100msIdx].show !== opts.show) {
              u.setSeries(violation100msIdx, { show: opts.show });
            }
            if (u.series[violation500msIdx] && u.series[violation500msIdx].show !== opts.show) {
              u.setSeries(violation500msIdx, { show: opts.show });
            }
          }
        }
      ],
      ready: [
        (u) => {
          // Initially sync violation series visibility with power series
          const powerSeriesShow = u.series[3].show;
          u.setSeries(6, { show: powerSeriesShow });
          u.setSeries(7, { show: powerSeriesShow });
          
          // Hide the violation series from legend by hiding their legend rows
          const legendRows = u.root.querySelectorAll('.u-legend tr');
          if (legendRows[6]) { // 100ms violations
            legendRows[6].style.display = 'none';
          }
          if (legendRows[7]) { // 500ms violations
            legendRows[7].style.display = 'none';
          }
        }
      ]
    }
  };
}

function downloadImage(uplot, filename) {
  let pxRatio = devicePixelRatio;
  let rect = uplot.root.getBoundingClientRect();
  let rect2 = uplot.ctx.canvas.getBoundingClientRect();
  let htmlContent = uplot.root.outerHTML;

  //NOTE: Use correct index here to address uPlot stylesheet. Needs to be in a separate resource for this to work.
  let uPlotCssRules = [...document.styleSheets].find(x => x.cssRules[0].selectorText && x.cssRules[0].selectorText.includes("uplot")).cssRules;
  let cssContent = "";

  for (let { cssText } of uPlotCssRules) {
    cssContent += `${cssText} `;
  }

  let width = Math.ceil(rect.width * pxRatio);
  let height = Math.ceil(rect.height * pxRatio);
  let viewBox = `0 0 ${Math.ceil(rect.width)} ${Math.ceil(rect.height)}`;

  let svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
        <style>
            body { margin: 0; padding: 0; }
            ${cssContent}
        </style>
        <foreignObject width="100%" height="100%">
            <body xmlns="http://www.w3.org/1999/xhtml">${htmlContent}</body>
        </foreignObject>
    </svg>
  `;

  let can = document.createElement('canvas');
  let ctx = can.getContext('2d');

  can.width = width;
  can.height = height;
  can.style.width = Math.ceil(rect.width) + "px";
  can.style.height = Math.ceil(rect.height) + "px";

  let img = new Image();

  img.crossOrigin = "anonymous";
  img.onload = () => {
    /* Once the SVG image is loaded in the img element,
     * we can start drawing on the canvas and download the file afterwards */
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, can.width, can.height);
    ctx.drawImage(img, 0, 0);
    ctx.drawImage(uplot.ctx.canvas, 0, (rect2.top - rect.top) * pxRatio);
    var a = document.createElement('a');
    a.href = can.toDataURL();
    a.download = filename + ".png";
    a.click();
  };

  let blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });

  /* Using blob.toDataURL() taints the img element due to a bug in Chrome, see
   * https://stackoverflow.com/questions/50824012/why-does-this-svg-holding-blob-url-taint-the-canvas-in-chrome 
   * The workaround here converts the blob to a DataURL which avoids the bug. */
  let reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onload = function (e) {
    img.src = e.target.result;
  }
}
