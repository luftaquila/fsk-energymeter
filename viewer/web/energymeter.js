const PROTOCOL_VERSION = 0x02;
const LOG_MAGIC = 0xAA;

const LOG_TYPE = ["LOG_TYPE_HEADER", "LOG_TYPE_RECORD", "LOG_TYPE_EVENT", "LOG_TYPE_CNT"];

const HEADER_SIZE = 32;
const LOG_SIZE = 16;

const LOG_POS_TYPE = 1;
const LOG_POS_CHECKSUM = 2;
const LOG_POS_TIMESTAMP = 4;

const LOG_POS_HEADER_UID = 8;
const LOG_POS_HEADER_VERSION = 20;
const LOG_POS_HEADER_YEAR = 24;
const LOG_POS_HEADER_MONTH = 25;
const LOG_POS_HEADER_DAY = 26;
const LOG_POS_HEADER_HOUR = 27;
const LOG_POS_HEADER_MINUTE = 28;
const LOG_POS_HEADER_SECOND = 29;
const LOG_POS_HEADER_MILLISECOND = 30;

const LOG_POS_RECORD_HV_VOLTAGE = 8;
const LOG_POS_RECORD_HV_CURRENT = 10;
const LOG_POS_RECORD_LV_VOLTAGE = 12;
const LOG_POS_RECORD_TEMPERATURE = 14;

const LOG_POS_EVENT_TYPE = 8;
const LOG_POS_EVENT_ID = 9;
const LOG_POS_EVENT_DATA = 10;

const USB_CDC_VID = 0x1999;
const USB_CDC_PID = 0x0503;

const USB_CMD_MAGIC = 0xBB;
const USB_RES_MAGIC = 0xCC;

const USB_CMD = [
  "USB_CMD_HELLO",
  "USB_CMD_RTC",
  "USB_CMD_DEL",
  "USB_CMD_CNT",
];

const USB_RES = [
  "USB_RES_OK",
  "USB_RES_ERR_UNKNOWN",
  "USB_RES_ERR_INVALID",
];

const LEN_DEVICE_HELLO = 18;
const LEN_DEVICE_RES = 4;

const USB_RES_POS_MAGIC = 0;
const USB_RES_POS_RES = 1;
const USB_RES_POS_DATA = 2;


function parse(data) {
  let logs = {
    ok: 0,
    error: [],
    data: [],
    header: {},
  };

  let i = 0;
  let header_found = false;

  while (i < data.length) {
    // test magic byte and checksum
    if (data[i] !== LOG_MAGIC || !validate_checksum(data, i, data[i + LOG_POS_TYPE])) {
      // try to find next magic byte
      let n;

      for (n = i + 1; n < data.length; n++) {
        if (data[n] === LOG_MAGIC) {
          break;
        }
      }

      logs.error.push(`#${logs.data.length}: Invalid magic byte or checksum detected.`);
      logs.data.push({
        type: "LOG_TYPE_ERR",
        raw: data.slice(i, n),
      });

      i = n;
      continue;
    }

    let log = {
      type: LOG_TYPE[to_uint(8, data, i + LOG_POS_TYPE)],
    };

    if (logs.header.datetime) {
      log.timestamp = logs.header.datetime + to_uint(32, data, i + LOG_POS_TIMESTAMP);
    }

    switch (log.type) {
      case "LOG_TYPE_HEADER": {
        if (!header_found) {
          header_found = true;
        } else {
          logs.error.push(`#${logs.data.length}: Multiple header found. RTC battery may be out of charge.`);
          logs.ok--;
        }

        log.raw = data.slice(i, i + HEADER_SIZE);
        log.header = {
          uid: [
            to_uint(32, data, i + LOG_POS_HEADER_UID),
            to_uint(32, data, i + LOG_POS_HEADER_UID + 4),
            to_uint(32, data, i + LOG_POS_HEADER_UID + 8),
          ],
          version: to_uint(8, data, i + LOG_POS_HEADER_VERSION),
          datetime: Number(new Date(
            to_uint(8, data, i + LOG_POS_HEADER_YEAR) + 2000,
            to_uint(8, data, i + LOG_POS_HEADER_MONTH) - 1,
            to_uint(8, data, i + LOG_POS_HEADER_DAY),
            to_uint(8, data, i + LOG_POS_HEADER_HOUR),
            to_uint(8, data, i + LOG_POS_HEADER_MINUTE),
            to_uint(8, data, i + LOG_POS_HEADER_SECOND),
            to_uint(16, data, i + LOG_POS_HEADER_MILLISECOND),
          )),
        };
        log.timestamp = log.header.datetime + to_uint(32, data, i + LOG_POS_TIMESTAMP);

        logs.header = log.header;
        break;
      }

      case "LOG_TYPE_RECORD": {
        if (!header_found || !logs.header.datetime) {
          throw new Error("No valid header found. File may be corrupted.");
        }

        log.raw = data.slice(i, i + LOG_SIZE);
        log.record = {
          hv_voltage: to_int(16, data, i + LOG_POS_RECORD_HV_VOLTAGE) / 10,    // 0.1 V
          hv_current: to_int(16, data, i + LOG_POS_RECORD_HV_CURRENT) / 10,    // 0.1 A
          lv_voltage: to_int(16, data, i + LOG_POS_RECORD_LV_VOLTAGE) / 100,   // 0.01 V
          temperature: to_int(16, data, i + LOG_POS_RECORD_TEMPERATURE) / 100, // 0.01 °C
        };
        break;
      }

      case "LOG_TYPE_EVENT": {
        if (!header_found || !logs.header.datetime) {
          throw new Error("No valid header found. File may be corrupted.");
        }

        log.raw = data.slice(i, i + LOG_SIZE);
        log.event = {
          type: to_uint(8, data, i + LOG_POS_EVENT_TYPE),
          id: to_uint(8, data, i + LOG_POS_EVENT_ID),
          data: data.slice(i + LOG_POS_EVENT_DATA, i + LOG_POS_EVENT_DATA + 6),
        };
        break;
      }

      default: {
        log.raw = data.slice(i, i + LOG_SIZE);
        logs.error.push(`#${logs.data.length}: Unknown log type found.`);
        logs.ok--;
        break;
      }
    }

    logs.data.push(log);
    logs.ok++;
    i += log.type === "LOG_TYPE_HEADER" ? HEADER_SIZE : LOG_SIZE;
  }

  let processed = [[], [], [], [], [], []];

  for (let log of logs.data) {
    if (log.type === "LOG_TYPE_RECORD") {
      processed[0].push(log.timestamp);
      processed[1].push(log.record.hv_voltage);
      processed[2].push(log.record.hv_current);
      processed[3].push(log.record.hv_voltage * log.record.hv_current / 1000);
      processed[4].push(log.record.lv_voltage);
      processed[5].push(log.record.temperature);
    };
  }

  return {
    logs: logs,
    processed: processed
  };
}

/* utility functions***********************************************************/
function validate_checksum(buffer, start, type) {
  let size = LOG_TYPE[type] === "LOG_TYPE_HEADER" ? HEADER_SIZE : LOG_SIZE;
  let checksum = 0;

  for (let i = 0; i < size; i += 2) {
    // skip checksum field
    if (i === LOG_POS_CHECKSUM) {
      continue;
    }

    checksum ^= to_uint(16, buffer, start + i);
  }

  return checksum === to_uint(16, buffer, start + LOG_POS_CHECKSUM);
}

function to_string(buffer, start, end) {
  let str = String.fromCharCode(...buffer.slice(start, end));
  return str.slice(0, str.indexOf('\u0000')); // drop from the null character
}

function to_uint(bit, buffer, start) {
  if (bit <= 0 || bit & (bit - 1) !== 0) {
    throw new Error("Invalid bit count: bit must be a power of two");
  }

  let ret = 0;

  for (let i = 0; i < bit / 8; i++) {
    ret += buffer[start + i] * Math.pow(2, i * 8); // little endian
  }

  return ret;
}

function to_int(bit, buffer, start) {
  return signed(to_uint(bit, buffer, start), bit);
}

function signed(value, bit) {
  return (value > Math.pow(2, bit - 1) - 1) ? value - Math.pow(2, bit) : value;
}

