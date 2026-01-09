export const LOG_MAGIC = 0xaa;

export const LOG_TYPE = ["LOG_TYPE_HEADER", "LOG_TYPE_RECORD", "LOG_TYPE_EVENT", "LOG_TYPE_CNT"];

export const HEADER_SIZE = 32;
export const LOG_SIZE = 16;

export const LOG_POS_TYPE = 1;
export const LOG_POS_CHECKSUM = 2;
export const LOG_POS_TIMESTAMP = 4;

export const LOG_POS_HEADER_UID = 8;
export const LOG_POS_HEADER_V_CAL = 20;
export const LOG_POS_HEADER_C_CAL = 22;
export const LOG_POS_HEADER_YEAR = 24;
export const LOG_POS_HEADER_MONTH = 25;
export const LOG_POS_HEADER_DAY = 26;
export const LOG_POS_HEADER_HOUR = 27;
export const LOG_POS_HEADER_MINUTE = 28;
export const LOG_POS_HEADER_SECOND = 29;
export const LOG_POS_HEADER_MILLISECOND = 30;

export const LOG_POS_RECORD_HV_VOLTAGE = 8;
export const LOG_POS_RECORD_HV_CURRENT = 10;
export const LOG_POS_RECORD_LV_VOLTAGE = 12;
export const LOG_POS_RECORD_TEMPERATURE = 14;

export const LOG_POS_EVENT_TYPE = 8;
export const LOG_POS_EVENT_ID = 9;
export const LOG_POS_EVENT_DATA = 10;

export const USB_CDC_VID = 0x1999;
export const USB_CDC_PID = 0x0503;

export const USB_CMD_MAGIC = 0xbb;
export const USB_RES_MAGIC = 0xcc;

export const USB_CMD = ["USB_CMD_HELLO", "USB_CMD_RTC", "USB_CMD_DEL", "USB_CMD_CNT"];
export const USB_RES = ["USB_RES_OK", "USB_RES_ERR_UNKNOWN", "USB_RES_ERR_INVALID"];

export const LEN_DEVICE_HELLO = 18;
export const LEN_DEVICE_RES = 4;

export const USB_RES_POS_MAGIC = 0;
export const USB_RES_POS_RES = 1;
export const USB_RES_POS_DATA = 2;

export function toUint(bit, buffer, start) {
  if (bit <= 0 || (bit & (bit - 1)) !== 0) {
    throw new Error("Invalid bit count: bit must be a power of two");
  }
  let ret = 0;
  for (let i = 0; i < bit / 8; i++) {
    ret += buffer[start + i] * Math.pow(2, i * 8);
  }
  return ret;
}

function toInt(bit, buffer, start) {
  return signed(toUint(bit, buffer, start), bit);
}

function signed(value, bit) {
  return value > Math.pow(2, bit - 1) - 1 ? value - Math.pow(2, bit) : value;
}

function validateChecksum(buffer, start, type) {
  const size = LOG_TYPE[type] === "LOG_TYPE_HEADER" ? HEADER_SIZE : LOG_SIZE;
  let checksum = 0;
  for (let i = 0; i < size; i += 2) {
    if (i === LOG_POS_CHECKSUM) continue;
    checksum ^= toUint(16, buffer, start + i);
  }
  return checksum === toUint(16, buffer, start + LOG_POS_CHECKSUM);
}

export function parse(data) {
  const logs = { ok: 0, error: [], data: [], header: {} };
  let i = 0;
  let headerFound = false;

  while (i < data.length) {
    if (data[i] !== LOG_MAGIC || !validateChecksum(data, i, data[i + LOG_POS_TYPE])) {
      let n;
      for (n = i + 1; n < data.length; n++) {
        if (data[n] === LOG_MAGIC) break;
      }
      logs.error.push(`#${logs.data.length}: Invalid magic byte or checksum detected.`);
      logs.data.push({ type: "LOG_TYPE_ERR", raw: data.slice(i, n) });
      i = n;
      continue;
    }

    const log = { type: LOG_TYPE[toUint(8, data, i + LOG_POS_TYPE)] };
    if (logs.header.datetime) {
      log.timestamp = logs.header.datetime + toUint(32, data, i + LOG_POS_TIMESTAMP);
    }

    switch (log.type) {
      case "LOG_TYPE_HEADER": {
        if (!headerFound) headerFound = true;
        else {
          logs.error.push(`#${logs.data.length}: Multiple header found. RTC battery may be out of charge.`);
          logs.ok--;
        }
        log.raw = data.slice(i, i + HEADER_SIZE);
        log.header = {
          uid: [
            toUint(32, data, i + LOG_POS_HEADER_UID),
            toUint(32, data, i + LOG_POS_HEADER_UID + 4),
            toUint(32, data, i + LOG_POS_HEADER_UID + 8),
          ],
          startup: toUint(32, data, i + LOG_POS_TIMESTAMP),
          v_cal: toInt(16, data, i + LOG_POS_HEADER_V_CAL),
          c_cal: toInt(16, data, i + LOG_POS_HEADER_C_CAL),
          datetime: Number(
            new Date(
              toUint(8, data, i + LOG_POS_HEADER_YEAR) + 2000,
              toUint(8, data, i + LOG_POS_HEADER_MONTH) - 1,
              toUint(8, data, i + LOG_POS_HEADER_DAY),
              toUint(8, data, i + LOG_POS_HEADER_HOUR),
              toUint(8, data, i + LOG_POS_HEADER_MINUTE),
              toUint(8, data, i + LOG_POS_HEADER_SECOND),
              toUint(16, data, i + LOG_POS_HEADER_MILLISECOND),
            ),
          ),
        };
        log.timestamp = log.header.datetime + log.header.startup;
        logs.header = log.header;
        break;
      }
      case "LOG_TYPE_RECORD": {
        if (!headerFound || !logs.header.datetime) throw new Error("No valid header found. File may be corrupted.");
        log.raw = data.slice(i, i + LOG_SIZE);
        log.record = {
          hv_voltage: toInt(16, data, i + LOG_POS_RECORD_HV_VOLTAGE) / 10,
          hv_current: toInt(16, data, i + LOG_POS_RECORD_HV_CURRENT) / 10,
          lv_voltage: toInt(16, data, i + LOG_POS_RECORD_LV_VOLTAGE) / 100,
          temperature: toInt(16, data, i + LOG_POS_RECORD_TEMPERATURE) / 100,
        };
        break;
      }
      case "LOG_TYPE_EVENT": {
        if (!headerFound || !logs.header.datetime) throw new Error("No valid header found. File may be corrupted.");
        log.raw = data.slice(i, i + LOG_SIZE);
        log.event = {
          type: toUint(8, data, i + LOG_POS_EVENT_TYPE),
          id: toUint(8, data, i + LOG_POS_EVENT_ID),
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
  return logs;
}

export function calculateMetadata(data, powerLimit = 80) {
  const processed = [[], [], [], [], [], [], [], []];
  const violations = [];

  let totalEnergy = 0;
  let maxPower = Number.MIN_SAFE_INTEGER;
  let maxPowerTs = 0;
  let maxVoltage = Number.MIN_SAFE_INTEGER;
  let maxVoltageTs = 0;
  let maxCurrent = Number.MIN_SAFE_INTEGER;
  let maxCurrentTs = 0;

  let pIdx = 0;

  let sum500ms = 0;
  let startIdx500 = 0;
  let last500msViolationTime = 0;

  let continuousOverLimitStartTs = -1;
  let last100msViolationTime = 0;

  const logs = data.data;
  const len = logs.length;
  let prevTimestamp = null;

  for (let i = 0; i < len; i++) {
    const log = logs[i];

    if (log.type !== "LOG_TYPE_RECORD") continue;

    const record = log.record;
    const timestamp = log.timestamp;

    const power = (record.hv_voltage * record.hv_current) / 1000;

    if (prevTimestamp !== null) {
      totalEnergy += (power * (timestamp - prevTimestamp)) / 3600000;
    }
    prevTimestamp = timestamp;

    if (power > maxPower) {
      maxPower = power;
      maxPowerTs = timestamp;
    }
    if (record.hv_voltage > maxVoltage) {
      maxVoltage = record.hv_voltage;
      maxVoltageTs = timestamp;
    }
    if (record.hv_current > maxCurrent) {
      maxCurrent = record.hv_current;
      maxCurrentTs = timestamp;
    }

    if (powerLimit > 0) {
      if (power > powerLimit) {
        if (continuousOverLimitStartTs === -1) {
          continuousOverLimitStartTs = timestamp;
        }

        if (timestamp - continuousOverLimitStartTs >= 100 && timestamp - last100msViolationTime >= 100) {
          violations.push({
            index: pIdx,
            timestamp: timestamp,
            value: power,
            type: "100 ms continuous power limit violation",
          });
          last100msViolationTime = timestamp;
          continuousOverLimitStartTs = timestamp;
          continuousOverLimitStartTs = timestamp;
        }
      } else {
        continuousOverLimitStartTs = -1;
      }

      sum500ms += power;

      while (startIdx500 < pIdx && timestamp - processed[0][startIdx500] > 500) {
        sum500ms -= processed[3][startIdx500];
        startIdx500++;
      }

      const count = pIdx - startIdx500 + 1;
      const avg = sum500ms / count;

      if (timestamp - processed[0][startIdx500] <= 500) {
        if (avg > powerLimit && timestamp - last500msViolationTime >= 500) {
          violations.push({
            index: pIdx,
            timestamp: timestamp,
            value: power,
            type: "500 ms average power limit violation",
          });
          last500msViolationTime = timestamp;
          sum500ms = 0;
          startIdx500 = pIdx + 1;
        }
      }
    }

    processed[0].push(timestamp);
    processed[1].push(record.hv_voltage);
    processed[2].push(record.hv_current);
    processed[3].push(power);
    processed[4].push(record.lv_voltage);
    processed[5].push(record.temperature);
    processed[6].push(null);
    processed[7].push(null);

    pIdx++;
  }

  for (const v of violations) {
    if (v.index < processed[6].length) {
      if (v.type === "100 ms continuous power limit violation") {
        processed[6][v.index] = processed[3][v.index];
      } else {
        processed[7][v.index] = processed[3][v.index];
      }
    }
  }

  data.processed = processed;
  data.power = totalEnergy;
  data.max_power = maxPower;
  data.max_power_timestamp = maxPowerTs;
  data.max_voltage = maxVoltage;
  data.max_voltage_timestamp = maxVoltageTs;
  data.max_current = maxCurrent;
  data.max_current_timestamp = maxCurrentTs;
  data.violation = violations;

  return data;
}

export function msToHumanTime(ms) {
  const seconds = (ms / 1000).toFixed(1);
  const minutes = (ms / (1000 * 60)).toFixed(1);
  const hours = (ms / (1000 * 60 * 60)).toFixed(1);
  const days = (ms / (1000 * 60 * 60 * 24)).toFixed(1);
  if (seconds < 60) return seconds + " Seconds";
  else if (minutes < 60) return minutes + " Minutes";
  else if (hours < 24) return hours + " Hours";
  else return days + " Days";
}

export function formatTimestamp(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

export function formatUid(uid) {
  return uid.map((x) => x.toString(16).toUpperCase().padStart(8, "0")).join("-");
}
