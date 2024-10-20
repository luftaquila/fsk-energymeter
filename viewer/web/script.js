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

      switch (ext) {
        case 'log': {
          reader.readAsArrayBuffer(file);
          reader.onload = e => {
            let data = new Uint8Array(e.target.result);

            let date = filename.slice(0, 19);
            date = date.split('-');
            date = [date.slice(0, 3).join('-'), date.slice(3).join(':')];
            date = date.join('T');

            let result = parse(data, Number(new Date(date)));
            uplot.setData(result.processed);

            document.getElementById("log-cnt").innerText = `${(result.logs.ok + result.logs.error).toLocaleString()} total (${result.logs.ok.toLocaleString()} valid / ${result.logs.error.toLocaleString()} error)`;

            let duration = result.logs.data[result.logs.data.length - 1].timestamp - result.logs.data[0].timestamp;
            document.getElementById("log-duration").innerText = `${ms_to_human_time(duration)} (${duration.toLocaleString()} ms)`;

          };
          break;
        }

        // json and csv
        case 'json': {
          reader.readAsText(file);
          reader.onload = e => {
            let data = JSON.parse(e.target.result);
            let processed = [[], [], [], [], [], []];

            for (let log of data) {
              processed[0].push(log.timestamp);
              processed[1].push(log.hv_voltage);
              processed[2].push(log.hv_current);
              processed[3].push(log.hv_power);
              processed[4].push(log.lv_voltage);
              processed[5].push(log.temperature);
            }

            uplot.setData(processed);

            document.getElementById("log-cnt").innerText = `${data.length.toLocaleString()} total`;

            let duration = data[data.length - 1].timestamp - data[0].timestamp;
            document.getElementById("log-duration").innerText = `${ms_to_human_time(duration)} (${duration.toLocaleString()} ms)`;
          };
          break;
        }

        case 'csv': {
          reader.readAsText(file);
          reader.onload = e => {
            let data = e.target.result.split('\n').map(x => x.split(',')).slice(1, -1);
            let processed = [[], [], [], [], [], []];

            for (let log of data) {
              processed[0].push(Number(log[0]));
              processed[1].push(Number(log[1]));
              processed[2].push(Number(log[2]));
              processed[3].push(Number(log[3]));
              processed[4].push(Number(log[4]));
              processed[5].push(Number(log[5]));
            }

            uplot.setData(processed);

            document.getElementById("log-cnt").innerText = `${data.length.toLocaleString()} total`;

            let duration = data[data.length - 1][0] - data[0][0];
            document.getElementById("log-duration").innerText = `${ms_to_human_time(duration)} (${duration.toLocaleString()} ms)`;
          };
          break;
        }

        default:
          return;
      }

      document.getElementById("file-selected").innerText = `${filename}.${ext}`;

      document.getElementById("export-json").classList.remove("disabled");
      document.getElementById("export-csv").classList.remove("disabled");
      document.getElementById("export-image").classList.remove("disabled");
    }
  });

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
      document.getElementById("cmd-rtc").classList.add('disabled');
      document.getElementById("cmd-del").classList.add('disabled');

      notyf.error("Device disconnected");
    });

    try {
      await port.open({ baudRate: 115200 });
    } catch (e) {
      return notyf.error(`Connection failed: ${e}`);
    }

    let res = await transceive(new Uint8Array([USB_CMD_MAGIC, USB_CMD.indexOf("USB_CMD_HELLO"), ...new Array(6).fill(0)]), LEN_DEVICE_UID);

    if (!res) {
      return notyf.error("Failed to identify the device");
    }

    let uid = [];
    uid[0] = to_uint(32, res, 0);
    uid[1] = to_uint(32, res, 4);
    uid[2] = to_uint(32, res, 8);

    document.getElementById("device").innerText = uid.map(x => x.toString(16).toUpperCase().padStart(8, '0')).join('-');
    document.getElementById("connect").classList.remove('orange');
    document.getElementById("connect").classList.add('green', 'disabled');
    document.getElementById("cmd-rtc").classList.remove('disabled');
    document.getElementById("cmd-del").classList.remove('disabled');

    notyf.success("Device connected");
  });

  document.getElementById("cmd-rtc").addEventListener("click", async e => {
    let datetime = [
      new Date().getFullYear() - 2000,
      Number(`0x${new Date().getMonth() + 1}`),
      new Date().getDate(),
      new Date().getHours(),
      new Date().getMinutes(),
      new Date().getSeconds()
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
    let result = [];

    for (let i = 0; i < uplot._data[0].length; i++) {
      let record = {};

      for (let j = 0; j < uplot._data.length; j++) {
        record[export_labels[j]] = uplot._data[j][i];
      }

      result.push(record);
    }

    download(JSON.stringify(result, null, 2), `${filename}.json`, 'text/plain');
  });

  document.getElementById("export-csv").addEventListener("click", e => {
    let result = export_labels.join(",") + "\n";

    for (let i = 0; i < uplot._data[0].length; i++) {
      let record = [];

      for (let j = 0; j < uplot._data.length; j++) {
        record.push(uplot._data[j][i]);
      }

      result += record.join(",") + "\n";
    }

    download(result, `${filename}.csv`, 'text/plain');
  });

  document.getElementById("export-image").addEventListener("click", e => {
    downloadImage(uplot, filename);
  });
}


/* draw chart *****************************************************************/
function init_chart() {
  uplot = new uPlot({
    width: 900,
    height: 600,
    ms: true,
    series: [{
      value: (self, rawValue) => (rawValue ? new Date(rawValue).format("HH:mm:ss.l") : '-'),
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
        stroke: "hotpink",
        value: (self, rawValue) => (rawValue ? rawValue : (rawValue === 0 ? 0 : '-')) + 'kW',
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
        values: (self, ticks) => ticks.map(rawValue => new Date(rawValue).format("HH:mm:ss.l")),
      }, {
        scale: "A",
        stroke: "dodgerblue",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "A"),
        grid: { show: false, },
        ticks: { show: false, }
      }, {
        scale: "HV",
        stroke: "red",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "V"),
        grid: { show: false, },
        ticks: { show: false, }
      }, {
        scale: "kW",
        stroke: "hotpink",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "kW"),
        side: 1,
        ticks: { show: false, }
      }, {
        scale: "LV",
        stroke: "green",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "V"),
        side: 1,
        grid: { show: false, },
        ticks: { show: false, }
      }, {
        scale: "C",
        stroke: "orange",
        values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "°C"),
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

