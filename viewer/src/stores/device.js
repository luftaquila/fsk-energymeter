import { defineStore } from "pinia";
import { ref } from "vue";
import {
  USB_CDC_VID,
  USB_CDC_PID,
  USB_CMD_MAGIC,
  USB_RES_MAGIC,
  USB_CMD,
  USB_RES,
  LEN_DEVICE_RES,
  USB_RES_POS_MAGIC,
  USB_RES_POS_RES,
  toUint,
} from "../lib/energymeter";

export const useDeviceStore = defineStore("device", () => {
  const port = ref(null);
  const connected = ref(false);
  const uid = ref(null);
  const deviceTime = ref(null);

  async function transceive(query, bytes) {
    if (!port.value) return false;
    let reader, writer;
    try {
      writer = port.value.writable.getWriter();
      await writer.write(query);
      writer.releaseLock();
    } catch (e) {
      writer?.releaseLock();
      throw new Error(`Failed to query device: ${e}`);
    }

    reader = port.value.readable.getReader();
    let received = [];
    try {
      while (port.value?.readable) {
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise((_, rej) => setTimeout(rej, 1000, new Error("Timeout"))),
        ]);
        if (done) break;
        if (value) {
          received = [...received, ...Array.from(value)];
          if (received.length >= bytes) break;
        }
      }
    } catch (e) {
      reader.releaseLock();
      throw new Error(`Failed to receive response: ${e}`);
    }
    reader.releaseLock();
    return received;
  }

  async function connect() {
    if (!("serial" in navigator)) throw new Error("Web Serial API not supported");
    port.value = await navigator.serial.requestPort({
      filters: [{ usbVendorId: USB_CDC_VID, usbProductId: USB_CDC_PID }],
    });
    port.value.addEventListener("disconnect", () => {
      connected.value = false;
      uid.value = null;
      deviceTime.value = null;
    });
    await port.value.open({ baudRate: 115200 });
    await updateDeviceInfo();
    connected.value = true;
  }

  async function updateDeviceInfo() {
    const res = await transceive(
      new Uint8Array([USB_CMD_MAGIC, USB_CMD.indexOf("USB_CMD_HELLO"), ...new Array(6).fill(0)]),
      LEN_DEVICE_RES + 14,
    );
    if (!res) throw new Error("Failed to update device information");
    uid.value = [toUint(32, res, 0), toUint(32, res, 4), toUint(32, res, 8)];
    const d = {
      year: String(toUint(8, res, 12)).padStart(2, "0"),
      month: String(toUint(8, res, 13)).padStart(2, "0"),
      day: String(toUint(8, res, 14)).padStart(2, "0"),
      hour: String(toUint(8, res, 15)).padStart(2, "0"),
      minute: String(toUint(8, res, 16)).padStart(2, "0"),
      second: String(toUint(8, res, 17)).padStart(2, "0"),
    };
    deviceTime.value = `20${d.year}-${d.month}-${d.day} ${d.hour}:${d.minute}:${d.second}`;
  }

  async function syncRtc() {
    const now = new Date();
    const datetime = [
      Number(`0x${(now.getFullYear() % 100).toString().padStart(2, "0")}`),
      Number(`0x${(now.getMonth() + 1).toString().padStart(2, "0")}`),
      Number(`0x${now.getDate().toString().padStart(2, "0")}`),
      Number(`0x${now.getHours().toString().padStart(2, "0")}`),
      Number(`0x${now.getMinutes().toString().padStart(2, "0")}`),
      Number(`0x${now.getSeconds().toString().padStart(2, "0")}`),
    ];
    const res = await transceive(
      new Uint8Array([USB_CMD_MAGIC, USB_CMD.indexOf("USB_CMD_RTC"), ...datetime]),
      LEN_DEVICE_RES,
    );
    if (!res || res[USB_RES_POS_MAGIC] !== USB_RES_MAGIC || res[USB_RES_POS_RES] !== USB_RES.indexOf("USB_RES_OK"))
      throw new Error("RTC sync failed");
    await updateDeviceInfo();
  }

  async function deleteRecords() {
    const res = await transceive(
      new Uint8Array([USB_CMD_MAGIC, USB_CMD.indexOf("USB_CMD_DEL"), ...new Array(6).fill(0)]),
      LEN_DEVICE_RES,
    );
    if (!res || res[USB_RES_POS_MAGIC] !== USB_RES_MAGIC || res[USB_RES_POS_RES] !== USB_RES.indexOf("USB_RES_OK"))
      throw new Error("Delete failed");
  }

  return { port, connected, uid, deviceTime, connect, updateDeviceInfo, syncRtc, deleteRecords };
});
