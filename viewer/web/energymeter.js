const LOG_MAGIC = 0xAA;
const LOG_TYPE = [ "LOG_TYPE_RECORD", "LOG_TYPE_EVENT", "LOG_TYPE_CNT" ];

const LOG_SIZE = 16;
const LOG_POS_TYPE = 1;
const LOG_POS_CHECKSUM = 2;
const LOG_POS_TIMESTAMP = 4;
const LOG_POS_DATA = 8;

const LOG_POS_RECORD_HV_VOLTAGE = 8;
const LOG_POS_RECORD_HV_CURRENT = 10;
const LOG_POS_RECORD_LV_VOLTAGE = 12;
const LOG_POS_RECORD_TEMPERATURE = 14;

const LOG_POS_EVENT_TYPE = 8;
const LOG_POS_EVENT_ID = 9;
const LOG_POS_EVENT_DATA = 10;

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


function parse(data) {
  let logs = {
    ok: 0,
    error: 0,
    data: [],
  };

  let i = 0;

  while (i < data.length) {
    // test magic byte and checksum
    if (data[i] !== LOG_MAGIC || !validate_checksum(data, i)) {
      logs.error++;

      // try to find next magic byte
      let n;

      for (n = i; n < data.length; n++) {
        if (data[n] === LOG_MAGIC) {
          break;
        }
      }

      i = n;
      continue;
    }

    let log = {
      raw: data.slice(i, i + LOG_SIZE),
      type: LOG_TYPE[to_uint(8, data, i + LOG_POS_TYPE)],
      timestamp: to_uint(32, data, i + LOG_POS_TIMESTAMP),
    };

    switch (log.type) {
      case "LOG_TYPE_RECORD": {
        log.record = {
          hv_voltage: to_uint(16, data, i + LOG_POS_RECORD_HV_VOLTAGE) / 100, // 0.01 V
          hv_current: to_int(16, data, i + LOG_POS_RECORD_HV_CURRENT) / 10, // 0.1 A, signed
          lv_voltage: to_uint(16, data, i + LOG_POS_RECORD_LV_VOLTAGE) / 100, // 0.01 V
          temperature: to_int(16, data, i + LOG_POS_RECORD_TEMPERATURE) / 100, // 0.01 °C
        };
        break;
      }

      case "LOG_TYPE_EVENT": {
        log.event = {
          type: to_uint(8, data, i + LOG_POS_EVENT_TYPE),
          id: to_uint(8, data, i + LOG_POS_EVENT_ID),
          data: data.slice(i + LOG_POS_EVENT_DATA, i + LOG_POS_EVENT_DATA + 6),
        };
        break;
      }

      default: {
        logs.error++;
        i += LOG_SIZE;
        continue;
      }
    }

    logs.data.push(log);
    logs.ok++;
    i += LOG_SIZE;
  }

  let processed = [[], [], [], [], [], []];

  for (let log of logs.data) {
    if (log.type === "LOG_TYPE_RECORD") {
      processed[0].push(log.timestamp);
      processed[1].push(log.record.hv_voltage);
      processed[2].push(log.record.hv_current);
      processed[3].push(log.record.lv_voltage);
      processed[4].push(log.record.temperature);
    };
  }

  return processed;
}

/* utility functions***********************************************************/
function validate_checksum(buffer, start) {
  let checksum = 1;
  checksum += to_uint(16, buffer, start);
  checksum += to_uint(16, buffer, start + 2);
  checksum += to_uint(16, buffer, start + 4);
  checksum += to_uint(16, buffer, start + 6);
  checksum += to_uint(16, buffer, start + 8);
  checksum += to_uint(16, buffer, start + 10);
  checksum += to_uint(16, buffer, start + 12);
  checksum += to_uint(16, buffer, start + 14);

  return !(checksum & 0xFFFF);
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

