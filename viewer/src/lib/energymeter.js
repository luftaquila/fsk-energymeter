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
          v_cal: toInt(16, data, i + LOG_POS_HEADER_V_CAL) / 100 / 10,
          c_cal: toInt(16, data, i + LOG_POS_HEADER_C_CAL) / 100 / 10,
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

export const VIOLATION_100MS = "100 ms continuous power limit violation";
export const VIOLATION_500MS = "500 ms average power limit violation";

// each record stands for the interval since the previous record, as in the energy calculation
export function calculateMetadata(data, powerLimit = 80) {
  const processed = [[], [], [], [], [], [], [], []];
  const violations = [];

  // power checks use integer power in 0.01 W so the moving sum and the limit comparisons are exact
  const powerRaw = [];
  const powerLimitRaw = powerLimit * 100000;

  let totalEnergy = 0;
  let regenEnergy = 0;
  let maxPower = Number.MIN_SAFE_INTEGER;
  let maxPowerTs = 0;
  let maxVoltage = Number.MIN_SAFE_INTEGER;
  let maxVoltageTs = 0;
  let minVoltage = Number.MAX_SAFE_INTEGER;
  let maxCurrent = Number.MIN_SAFE_INTEGER;
  let maxCurrentTs = 0;
  let minCurrent = Number.MAX_SAFE_INTEGER;

  let pIdx = 0;

  let sum500ms = 0;
  let startIdx500 = 0;
  let last500msViolationTime = 0;
  let last500msViolation = null;

  let continuousOverLimitStartTs = -1;
  let peak100ms = null;

  const logs = data.data;
  const len = logs.length;
  let prevTimestamp = null;

  for (let i = 0; i < len; i++) {
    const log = logs[i];

    if (log.type !== "LOG_TYPE_RECORD") continue;

    const record = log.record;
    const timestamp = log.timestamp;

    const power = (record.hv_voltage * record.hv_current) / 1000;
    const raw = Math.round(record.hv_voltage * 10) * Math.round(record.hv_current * 10);

    if (prevTimestamp !== null) {
      const energy = (power * (timestamp - prevTimestamp)) / 3600000;
      totalEnergy += energy;
      if (energy < 0) regenEnergy -= energy;
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
    if (record.hv_voltage < minVoltage) {
      minVoltage = record.hv_voltage;
    }
    if (record.hv_current > maxCurrent) {
      maxCurrent = record.hv_current;
      maxCurrentTs = timestamp;
    }
    if (record.hv_current < minCurrent) {
      minCurrent = record.hv_current;
    }

    if (powerLimit > 0) {
      if (raw > powerLimitRaw) {
        if (continuousOverLimitStartTs === -1) {
          // the over-limit interval starts at the last record below the limit
          continuousOverLimitStartTs = pIdx > 0 ? processed[0][pIdx - 1] : timestamp;
        }
        if (peak100ms === null || power > peak100ms.value) {
          peak100ms = { index: pIdx, timestamp: timestamp, value: power };
        }

        if (timestamp - continuousOverLimitStartTs >= 100) {
          violations.push({
            ...peak100ms,
            type: VIOLATION_100MS,
            start: continuousOverLimitStartTs,
            end: timestamp,
          });
          continuousOverLimitStartTs = timestamp;
          peak100ms = null;
        }
      } else {
        continuousOverLimitStartTs = -1;
        peak100ms = null;
      }

      sum500ms += raw;

      // the window (timestamp - 500, timestamp] holds 500 ms worth of records
      while (startIdx500 < pIdx && timestamp - processed[0][startIdx500] >= 500) {
        sum500ms -= powerRaw[startIdx500];
        startIdx500++;
      }

      const count = pIdx - startIdx500 + 1;
      const avg = sum500ms / count / 100000;

      if (timestamp - processed[0][0] >= 500 && sum500ms > powerLimitRaw * count) {
        // a violation is reported as the 500 ms window with the highest average
        if (timestamp - last500msViolationTime >= 500) {
          last500msViolation = {
            index: pIdx,
            timestamp: timestamp,
            value: avg,
            type: VIOLATION_500MS,
            start: timestamp - 500,
            end: timestamp,
          };
          violations.push(last500msViolation);
          last500msViolationTime = timestamp;
        } else if (avg > last500msViolation.value) {
          // still within 500 ms of the latest violation, so it belongs to that violation
          last500msViolation.index = pIdx;
          last500msViolation.timestamp = timestamp;
          last500msViolation.value = avg;
          last500msViolation.start = timestamp - 500;
          last500msViolation.end = timestamp;
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
    powerRaw.push(raw);

    pIdx++;
  }

  violations.sort((a, b) => a.start - b.start);

  for (const v of violations) {
    if (v.index < processed[6].length) {
      if (v.type === VIOLATION_100MS) {
        processed[6][v.index] = v.value;
      } else {
        processed[7][v.index] = v.value;
      }
    }
  }

  data.processed = processed;
  data.power = totalEnergy;
  data.regen_energy = regenEnergy;
  data.max_power = maxPower;
  data.max_power_timestamp = maxPowerTs;
  data.max_voltage = maxVoltage;
  data.max_voltage_timestamp = maxVoltageTs;
  data.min_voltage = minVoltage;
  data.max_current = maxCurrent;
  data.max_current_timestamp = maxCurrentTs;
  data.min_current = minCurrent;
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

export function formatEnergy(kwh) {
  return formatEnergyBreakdown(kwh, 0).total;
}

// one unit for all lines, with discharge derived from the rounded values so the lines add up
export function formatEnergyBreakdown(total, regen) {
  const kwh = Math.abs(Math.round((total + regen) * 10000)) >= 10000;
  const steps = kwh ? 1000 : 10000;
  const t = Math.round(total * steps);
  const r = Math.round(regen * steps);
  const format = (n) => (kwh ? `${(n / 1000).toFixed(3)} kWh` : `${(n / 10).toFixed(1)} Wh`);
  return { discharge: format(t + r), regen: format(-r), total: format(t) };
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
