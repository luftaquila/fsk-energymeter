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
				
				if (key == 'y' && shouldSyncY)  {
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

          let {left, top} = u.cursor;

          let leftPct = left/rect.width;
          let btmPct = 1 - top/rect.height;
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
    let fr = {x: 0, y: 0, dx: 0, dy: 0};
    let to = {x: 0, y: 0, dx: 0, dy: 0};

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
        t.y = (yMin+yMax)/2;
        t.x = (xMin+xMax)/2;

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

      let leftPct = left/rect.width;
      let btmPct = 1 - top/rect.height;

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
      storePos(to, e);

      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(zoom);
      }
    }

    over.addEventListener("touchstart", function(e) {
      rect = over.getBoundingClientRect();

      storePos(fr, e);

      oxRange = u.scales.x.max - u.scales.x.min;
      oyRange = u.scales.y.max - u.scales.y.min;

      let left = fr.x;
      let top = fr.y;

      xVal = u.posToVal(left, "x");
      yVal = u.posToVal(top, "y");

      document.addEventListener("touchmove", touchmove, {passive: true});
      e.preventDefault();
    });

    over.addEventListener("touchend", function(e) {
      document.removeEventListener("touchmove", touchmove, {passive: true});
      e.preventDefault();
    });
  }

  return {
    hooks: {
      init,
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

  let blob = new Blob([svgText], {type: 'image/svg+xml;charset=utf-8'});
  
  /* Using blob.toDataURL() taints the img element due to a bug in Chrome, see
   * https://stackoverflow.com/questions/50824012/why-does-this-svg-holding-blob-url-taint-the-canvas-in-chrome 
   * The workaround here converts the blob to a DataURL which avoids the bug. */
  let reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onload = function(e) {
    img.src = e.target.result;
  }
}
