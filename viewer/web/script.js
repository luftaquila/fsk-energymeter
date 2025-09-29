setup();

function setup() {
  notyf = new Notyf({ ripple: false, duration: 3500 });
  init_chart();

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

    if (file) {
      let reader = new FileReader();
      ext = file.name.split('.').pop();
      filename = file.name.replace(`.${ext}`, '');

      document.getElementById("file-selected").innerText = "Processing data...";
      document.getElementById("log-boot").innerText = "N/A";
      document.getElementById("log-cnt").innerText = "N/A";
      document.getElementById("log-duration").innerText = "N/A";
      document.getElementById("log-uid").innerText = "N/A";
      document.getElementById("log-energy").innerText = "N/A";
      document.getElementById("log-current").innerText = "N/A";
      document.getElementById("log-power").innerText = "N/A";
      document.getElementById("error").style.display = "none";
      document.getElementById("warning").style.display = "none";

      switch (ext) {
        case 'log': {
          reader.readAsArrayBuffer(file);
          reader.onload = e => {
            try {
              result = parse(new Uint8Array(e.target.result));

              set_chart_data(result);
            } catch (e) {
              uplot.setData([]);
              document.getElementById("error").innerText = e;
              document.getElementById("error").style.display = "block";
              return;
            } finally {
              document.getElementById("file-selected").innerText = `${filename}.${ext}`;
            }
          };
          break;
        }

        case 'csv':
        case 'json': {
          reader.readAsText(file);
          reader.onload = e => {
            try {
              if (ext === 'csv') {
                let flag = false;
                let csv = e.target.result.split('\n');

                for (let i = 0; i < csv.length; i++) {
                  if (csv[i] === "original json data" && csv[i + 1]) {
                    flag = true;
                    result = { logs: JSON.parse(csv [i + 1]) };
                    break;
                  }
                }

                if (!flag) {
                  throw Error("Cannot restore JSON data.");
                }
              } else if (ext === 'json') {
                result = { logs: JSON.parse(e.target.result) };
              }

              result.processed = [[], [], [], [], [], []];
              result.logs.power = 0;
              result.logs.max_power = Number.MIN_SAFE_INTEGER;
              result.logs.max_current = Number.MIN_SAFE_INTEGER;

              for (const [i, log] of result.logs.data.entries()) {
                if (log.type === "LOG_TYPE_RECORD") {
                  const power = log.record.hv_voltage * log.record.hv_current / 1000;

                  if (i) {
                    result.logs.power += power * (log.timestamp - result.logs.data[i - 1].timestamp) / 3600000;
                  }

                  if (power > result.logs.max_power) {
                    result.logs.max_power = power;
                  }

                  if (log.record.hv_current > result.logs.max_current) {
                    result.logs.max_current = log.record.hv_current;
                  }

                  result.processed[0].push(log.timestamp);
                  result.processed[1].push(log.record.hv_voltage);
                  result.processed[2].push(log.record.hv_current);
                  result.processed[3].push(power);
                  result.processed[4].push(log.record.lv_voltage);
                  result.processed[5].push(log.record.temperature);
                };
              }

              set_chart_data(result);
            } catch (e) {
              uplot.setData([]);
              document.getElementById("error").innerText = e;
              document.getElementById("error").style.display = "block";
              return;
            } finally {
              document.getElementById("file-selected").innerText = `${filename}.${ext}`;
            }
          };

          break;
        }

        default:
          return;
      }
    }
  });

  function set_chart_data(data) {
    uplot.setData(data.processed);
    display_metadata(data.logs);
    console.log(data);

    document.getElementById("export-json").classList.remove("disabled");
    document.getElementById("export-csv").classList.remove("disabled");
    document.getElementById("reverse-current").classList.remove("disabled");
  }

  /* serial command funcntions**************************************************/
  document.getElementById("connect").addEventListener("click", async e => {
    if (!("serial" in navigator)) {
      return notyf.error("Web Serial API not supported.");
    }

    port = await navigator.serial.requestPort({
      filters: [{
        usbVendorId: USB_CDC_VID,
        usbProductId: USB_CDC_PID,
      }]
    });

    // device disconnect event handler
    port.addEventListener("disconnect", e => {
      document.getElementById("device").innerText = "UNKNOWN";
      document.getElementById("connect").classList.remove('green', 'disabled');
      document.getElementById("connect").classList.add('orange');
      document.getElementById("cmd-hello").classList.add('disabled');
      document.getElementById("cmd-rtc").classList.add('disabled');
      document.getElementById("cmd-del").classList.add('disabled');
      document.getElementById("cmd-del-unlock").classList.add('disabled');
      document.getElementById("cmd-del-unlock").innerHTML = `<i class="fas fw fa-lock"></i>Unlock`;

      notyf.error("Device disconnected");
    });

    try {
      await port.open({ baudRate: 115200 });
    } catch (e) {
      return notyf.error(`Connection failed: ${e}`);
    }

    if (!await update_device_info()) {
      return;
    }

    document.getElementById("connect").classList.remove('orange');
    document.getElementById("connect").classList.add('green', 'disabled');
    document.getElementById("cmd-hello").classList.remove('disabled');
    document.getElementById("cmd-rtc").classList.remove('disabled');
    document.getElementById("cmd-del-unlock").classList.remove('disabled');

    notyf.success("Device connected");
  });

  document.getElementById("cmd-hello").addEventListener("click", async e => {
    await update_device_info();
  });

  document.getElementById("cmd-rtc").addEventListener("click", async e => {
    let datetime = [
      Number(`0x${new Date().getFullYear() % 100}`),
      Number(`0x${new Date().getMonth() + 1}`),
      Number(`0x${new Date().getDate()}`),
      Number(`0x${new Date().getHours()}`),
      Number(`0x${new Date().getMinutes()}`),
      Number(`0x${new Date().getSeconds()}`)
    ];

    let res = await transceive(new Uint8Array([USB_CMD_MAGIC, USB_CMD.indexOf("USB_CMD_RTC"), ...datetime]), LEN_DEVICE_RES);

    if (!res) {
      console.log(res);
      return notyf.error("Failed to command the device");
    }

    if (res[USB_RES_POS_MAGIC] !== USB_RES_MAGIC) {
      console.log(res);
      return notyf.error("Device response error");
    }

    if (res[USB_RES_POS_RES] !== USB_RES.indexOf("USB_RES_OK")) {
      console.log(res);
      return notyf.Error("RTC sync command failed");
    }

    notyf.success("Device RTC synchronized");
    await update_device_info();
  });

  document.getElementById("cmd-del-unlock").addEventListener("click", e => {
    switch (e.target.innerText) {
      case "Unlock": {
        document.getElementById("cmd-del").classList.remove('disabled');
        document.getElementById("cmd-del-unlock").innerHTML = `<i class="fas fw fa-lock-open"></i>Lock`;
        break;
      }

      case "Lock": {
        document.getElementById("cmd-del").classList.add('disabled');
        document.getElementById("cmd-del-unlock").innerHTML = `<i class="fas fw fa-lock"></i>Unlock`;
        break;
      }
    }
  });

  document.getElementById("cmd-del").addEventListener("click", async e => {
    let res = await transceive(new Uint8Array([USB_CMD_MAGIC, USB_CMD.indexOf("USB_CMD_DEL"), ...new Array(6).fill(0)]), LEN_DEVICE_RES);

    if (!res) {
      console.log(res);
      return notyf.error("Failed to command the device");
    }

    if (res[USB_RES_POS_MAGIC] !== USB_RES_MAGIC) {
      console.log(res);
      return notyf.error("Device response error");
    }

    if (res[USB_RES_POS_RES] !== USB_RES.indexOf("USB_RES_OK")) {
      console.log(res);
      return notyf.Error("Delete command failed");
    }

    notyf.success("Device log files deleted");
  });

  /* converted file exporters *************************************************/
  const export_labels = ["timestamp", "hv_voltage", "hv_current", "hv_power", "lv_voltage", "temperature"];

  document.getElementById("export-json").addEventListener("click", e => {
    download(JSON.stringify(result.logs, null, 2), `${filename}.json`, 'text/plain');
  });

  document.getElementById("export-csv").addEventListener("click", e => {
    let csv = export_labels.join(",") + "\n";

    for (let i = 0; i < uplot._data[0].length; i++) {
      let record = [];

      for (let j = 0; j < uplot._data.length; j++) {
        record.push(uplot._data[j][i]);
      }

      csv += record.join(",") + "\n";
    }

    csv += `\noriginal json data\n${JSON.stringify(result.logs)}`;

    download(csv, `${filename}.csv`, 'text/plain');
  });
}

async function update_device_info() {
  let res = await transceive(new Uint8Array([USB_CMD_MAGIC, USB_CMD.indexOf("USB_CMD_HELLO"), ...new Array(6).fill(0)]), LEN_DEVICE_RES);

  if (!res) {
    console.log(res);
    notyf.error("Failed to update device information");
    return false;
  }

  let uid = [];
  uid[0] = to_uint(32, res, 0);
  uid[1] = to_uint(32, res, 4);
  uid[2] = to_uint(32, res, 8);

  document.getElementById("device").innerText = uid.map(x => x.toString(16).toUpperCase().padStart(8, '0')).join('-');

  let d = {
    year: String(to_uint(8, res, 12)).padStart(2, '0'),
    month: String(to_uint(8, res, 13)).padStart(2, '0'),
    day: String(to_uint(8, res, 14)).padStart(2, '0'),
    hour: String(to_uint(8, res, 15)).padStart(2, '0'),
    minute: String(to_uint(8, res, 16)).padStart(2, '0'),
    second: String(to_uint(8, res, 17)).padStart(2, '0'),
  };

  document.getElementById("device-time").innerText = `20${d.year}-${d.month}-${d.day} ${d.hour}:${d.minute}:${d.second}`;

  return true;
}


/* draw chart *****************************************************************/
function init_chart() {
  const axis = {
    HV: {splits: [], max: 0, min: 0},
    A: {splits: [], max: 0, min: 0},
    kW: {splits: [], max: 0, min: 0},
    LV: {splits: [], max: 0, min: 0},
    C: {splits: [], max: 0, min: 0},
  };

  const scales = {};

  for (const [k, v] of Object.entries(axis)) {
    scales[k] = {
      range: (u, d_min, d_max) => {
        if (d_min === null && d_max === null) {
          return [null, null];
        } else {
          axis[k] = split_range(d_min, d_max);
          return [axis[k].min, axis[k].max];
        }
      }
    }
  }

  uplot = new uPlot({
    width: 900,
    height: 600,
    ms: true,
    series: [{
      value: (self, rawValue) => (rawValue ? new Date(rawValue).format("HH:MM:ss.l") : '-'),
      }, {
        label: "HV",
        scale: "HV",
        stroke: "red",
        value: (self, rawValue) => (rawValue ? rawValue : (rawValue === 0 ? 0 : '-')) + 'V',
      }, {
        label: "HV Amp",
        scale: "A",
        stroke: "dodgerblue",
        value: (self, rawValue) => (rawValue ? rawValue : (rawValue === 0 ? 0 : '-')) + 'A',
      }, {
        label: "HV Power",
        scale: "kW",
        stroke: "mediumorchid",
        value: (self, rawValue) => (rawValue ? rawValue.toFixed(1) : (rawValue === 0 ? 0 : '-')) + 'kW',
      }, {
        label: "LV",
        scale: "LV",
        stroke: "green",
        value: (self, rawValue) => (rawValue ? rawValue : (rawValue === 0 ? 0 : '-')) + 'V',
        show: false,
      }, {
        label: "Temp",
        scale: "C",
        stroke: "orange",
        value: (self, rawValue) => (rawValue ? rawValue : (rawValue === 0 ? 0 : '-')) + '°C',
        show: false,
      }
    ],
    axes: [{
        values: (self, ticks) => ticks.map(rawValue => new Date(rawValue).format("HH:MM:ss\nl")),
      }, {
        scale: "A",
        stroke: "dodgerblue",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "A"),
        splits: () => axis.A.splits,
        size: 55,
      }, {
        scale: "HV",
        stroke: "red",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "V"),
        splits: () => axis.HV.splits,
        size: 55,
      }, {
        scale: "kW",
        stroke: "midiumorchid",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "kW"),
        side: 1,
        splits: () => axis.kW.splits,
        size: 55,
      }, {
        scale: "LV",
        stroke: "green",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "V"),
        side: 1,
        splits: () => axis.LV.splits,
        size: 55,
      }, {
        scale: "C",
        stroke: "orange",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "°C"),
        side: 1,
        splits: () => axis.C.splits,
        size: 55,
      }
    ],
    scales: scales,
    plugins: [
      touchZoomPlugin(),
      wheelZoomPlugin({factor: 0.75})
    ],
  }, null, document.getElementById("chart"));
}


/* transmit query to device and return response *******************************/
async function transceive(query, bytes) {
  let reader;
  let writer;

  try {
    writer = port.writable.getWriter();
    await writer.write(query);
    writer.releaseLock();
  } catch (e) {
    writer.releaseLock();
    notyf.error(`Failed to query device: ${e}`);
    return false;
  }

  reader = port.readable.getReader();

  let received = [];

  try {
    while (port && port.readable) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(reject, 1000, new Error("Response Timeout")))
      ]);

      if (done) {
        break;
      }

      if (value) {
        received = [...received, ...Array.from(value)];

        if (received.length >= bytes) {
          break;
        }
      }
    }
  } catch (e) {
    reader.releaseLock();
    notyf.error(`Failed to receive response: ${e}`);
    return false;
  }

  reader.releaseLock();
  return received;
}


/* utility functions **********************************************************/
function ms_to_human_time(ms) {
  let seconds = (ms / 1000).toFixed(1);
  let minutes = (ms / (1000 * 60)).toFixed(1);
  let hours = (ms / (1000 * 60 * 60)).toFixed(1);
  let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1);
  if (seconds < 60) return seconds + " Seconds";
  else if (minutes < 60) return minutes + " Minutes";
  else if (hours < 24) return hours + " Hours";
  else return days + " Days"
}

function download(content, fileName, contentType) {
    let a = document.createElement("a");
    let file = new Blob([content], {type: contentType});
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
}

function display_metadata(logs) {
  document.getElementById("log-boot").innerText = `${new Date(logs.header.datetime).format("yyyy-mm-dd HH:MM:ss.l")}`;

  document.getElementById("log-cnt").innerText = `${(logs.data.length).toLocaleString()}`;
  document.getElementById("log-cnt").innerText += ` (${logs.ok.toLocaleString()} valid / ${logs.error.length.toLocaleString()} error)`;

  let duration = logs.data[logs.data.length - 1].timestamp - logs.data[0].timestamp;
  document.getElementById("log-duration").innerText = `${ms_to_human_time(duration)} (${duration.toLocaleString()} ms)`;

  document.getElementById("log-uid").innerText = logs.header.uid.map(x => x.toString(16).toUpperCase().padStart(8, '0')).join('-');

  document.getElementById("log-energy").innerText = `${logs.power.toFixed(2)} kWh`;
  document.getElementById("log-current").innerText = `${logs.max_current.toFixed(1)} A`;
  document.getElementById("log-power").innerText = `${logs.max_power.toFixed(1)} kW`;

  if (logs.header.datetime > Number(new Date(2099, 0))) {
    document.getElementById("warning").innerText = "Invalid RTC date detected. Sync the clock in the Device configuration tab.";
    document.getElementById("warning").style.display = "block";
  }

  if (logs.error.length) {
    document.getElementById("error").innerText = logs.error.join('\n');
    document.getElementById("error").style.display = "block";
  }
}

function split_range(d_min, d_max) {
  if (d_min === d_max) {
    d_min *= 0.85;
    d_max *= 1.15;
  } else {
    const range = d_max - d_min;
    d_min = d_min - range * 0.05;
    d_max = d_max + range * 0.05;
  }

  const tick = 10;
  const step = (d_max - d_min) / (tick - 1);
  const min = d_min;
  const max = d_max;
  const splits = Array.from({length: tick + 1}, (_, i) => min + i * step);
  return {min, max, splits};
}

Array.prototype.max = function () {
  return Math.max.apply(null, this.filter(x => x));
};

Array.prototype.min = function () {
  return Math.min.apply(null, this.filter(x => x));
};

/* new Date().format() ********************************************************/
var dateFormat = function () {
  var	token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
    timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
    timezoneClip = /[^-+\dA-Z]/g,
    pad = function (val, len) {
      val = String(val);
      len = len || 2;
      while (val.length < len) val = '0' + val;
      return val;
    };
  return function (date, mask, utc) {
    var dF = dateFormat;
    if (arguments.length == 1 && Object.prototype.toString.call(date) == '[object String]' && !/\d/.test(date)) {
      mask = date;
      date = undefined;
    }
    date = date ? new Date(date) : new Date;
    if (isNaN(date)) throw SyntaxError('invalid date');
    mask = String(dF.masks[mask] || mask || dF.masks['default']);
    if (mask.slice(0, 4) == 'UTC:') {
      mask = mask.slice(4);
      utc = true;
    }
    var	_ = utc ? 'getUTC' : 'get',
      d = date[_ + 'Date'](),
      D = date[_ + 'Day'](),
      m = date[_ + 'Month'](),
      y = date[_ + 'FullYear'](),
      H = date[_ + 'Hours'](),
      M = date[_ + 'Minutes'](),
      s = date[_ + 'Seconds'](),
      L = date[_ + 'Milliseconds'](),
      o = utc ? 0 : date.getTimezoneOffset(),
      flags = {
        d:    d,
        dd:   pad(d),
        ddd:  dF.i18n.dayNames[D],
        dddd: dF.i18n.dayNames[D + 7],
        m:    m + 1,
        mm:   pad(m + 1),
        mmm:  dF.i18n.monthNames[m],
        mmmm: dF.i18n.monthNames[m + 12],
        yy:   String(y).slice(2),
        yyyy: y,
        h:    H % 12 || 12,
        hh:   pad(H % 12 || 12),
        H:    H,
        HH:   pad(H),
        M:    M,
        MM:   pad(M),
        s:    s,
        ss:   pad(s),
        l:    pad(L, 3),
        L:    pad(L > 99 ? Math.round(L / 10) : L),
        t:    H < 12 ? 'a'  : 'p',
        tt:   H < 12 ? 'am' : 'pm',
        T:    H < 12 ? 'A'  : 'P',
        TT:   H < 12 ? '오전' : '오후',
        Z:    utc ? 'UTC' : (String(date).match(timezone) || ['']).pop().replace(timezoneClip, ''),
        o:    (o > 0 ? '-' : '+') + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
        S:    ['th', 'st', 'nd', 'rd'][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
      };
    return mask.replace(token, function ($0) {
      return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
    });
  };
}();
dateFormat.masks = {'default':'ddd mmm dd yyyy HH:MM:ss'};
dateFormat.i18n = {
  dayNames: [
    '일', '월', '화', '수', '목', '금', '토',
    '일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'
  ],
  monthNames: [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
  ]
};
Date.prototype.format = function(mask, utc) { return dateFormat(this, mask, utc); };

