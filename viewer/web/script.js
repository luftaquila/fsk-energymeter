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

