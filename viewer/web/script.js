setup();

function setup() {

  /* navigation sidebar handler ***********************************************/
  document.querySelectorAll('.nav-mode').forEach(elem => {
    elem.addEventListener("click", () => {
      document.querySelectorAll('.nav-mode').forEach(el => el.classList.remove('active'));
      elem.classList.add('active');
      mode = elem.id;

      document.querySelectorAll('.container').forEach(el => el.style.display = 'none');
      document.getElementById(`container-${mode}`).style.display = 'flex';
    });
  });

  /* file select event handler ************************************************/
  document.getElementById("file").addEventListener("change", e => {
    let file = e.target.files[0];

    document.getElementById("status").innerText = "Processing data...";

    if (file) {
      let reader = new FileReader();
      ext = file.name.split('.').pop();
      filename = file.name.replace(`.${ext}`, '');

      switch (ext) {
        case 'log': {
          reader.readAsArrayBuffer(file);
          reader.onload = e => {
            let data = new Uint8Array(e.target.result);
            uplot.setData(parse(data));
            document.getElementById("status").innerText = `${filename}.${ext} loaded`;
          };
          break;
        }

        // json and csv
        default: {
          reader.readAsText(file);
          reader.onload = e => {
            let data = e.target.result;

            console.log(data, filename, ext);
          };
          break;
        }
      }


    }

  });

  /* serial command funcntions**************************************************/
  document.getElementById("connect").addEventListener("click", e => {

  });

  document.getElementById("cmd-rtc").addEventListener("click", e => {

  });

  document.getElementById("cmd-del").addEventListener("click", e => {

  });

  /* converted file exporters *************************************************/
  document.getElementById("export-json").addEventListener("click", e => {

  });

  document.getElementById("export-csv").addEventListener("click", e => {

  });

  document.getElementById("export-image").addEventListener("click", e => {
    downloadImage(uplot, filename);
  });

  /* draw chart ***************************************************************/
  init_chart();
}

function init_chart() {
  uplot = new uPlot({
    width: 1000,
    height: 600,
    ms: true,
    series: [{
        value: (self, rawValue) => rawValue,
      }, {
        label: "HV",
        scale: "HV",
        stroke: "red",
        value: (self, rawValue) => rawValue ? rawValue + 'V' : '-',
      }, {
        label: "HV Amp",
        scale: "A",
        stroke: "dodgerblue",
        value: (self, rawValue) => rawValue ? rawValue + 'A' : '-',
      }, {
        label: "HV Power",
        scale: "W",
        stroke: "purple",
        value: (self, rawValue) => rawValue + 'W',
        value: (self, rawValue) => rawValue ? rawValue + 'W' : '-',
      }, {
        label: "LV",
        scale: "LV",
        stroke: "green",
        value: (self, rawValue) => rawValue + 'V',
        value: (self, rawValue) => rawValue ? rawValue + 'V' : '-',
        show: false,
      }, {
        label: "Temp",
        scale: "C",
        stroke: "orange",
        value: (self, rawValue) => rawValue ? rawValue + '°C' : '-',
        show: false,
      }
    ],
    axes: [{
        values: (self, ticks) => ticks.map(rawValue => rawValue),
      }, {
        scale: "A",
        stroke: "dodgerblue",
        values: (self, ticks) => ticks.map(rawValue => rawValue + "A"),
        grid: { show: false, },
        ticks: { show: false, }
      }, {
        scale: "HV",
        stroke: "red",
        values: (self, ticks) => ticks.map(rawValue => rawValue + "V"),
        grid: { show: false, },
        ticks: { show: false, }
      }, {
        scale: "W",
        stroke: "purple",
        values: (self, ticks) => ticks.map(rawValue => rawValue + "W"),
        side: 1,
      }, {
        scale: "LV",
        stroke: "green",
        values: (self, ticks) => ticks.map(rawValue => rawValue + "V"),
        side: 1,
        grid: { show: false, },
        ticks: { show: false, }
      }, {
        scale: "C",
        stroke: "orange",
        values: (self, ticks) => ticks.map(rawValue => rawValue + "°C"),
        side: 1,
        grid: { show: false, },
        ticks: { show: false, }
      }
    ],
    plugins: [
      wheelZoomPlugin({factor: 0.75}),
      touchZoomPlugin()
    ],
  }, null, document.getElementById("chart"));
}

