#include "ff.h"
#include "rtc.h"
#include "diskio.h"
#include "tusb.h"
#include "bsp_driver_sd.h"
#include "energymeter.h"

extern uint32_t uid[];

/******************************************************************************
 * USB mode function
 *****************************************************************************/
void energymeter_usb(void) {
  /* init USB_OTG_FS for TinyUSB */
  GPIO_InitTypeDef GPIO_InitStruct;

  // Configure USB FS GPIOs
  __HAL_RCC_GPIOA_CLK_ENABLE();

  // Pull down PA12 USB_DP for 5ms to force trigger bus enumeration on the host
  GPIO_InitStruct.Pin = GPIO_PIN_12;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  HAL_Delay(5);

  // Configure USB D+ D- Pins
  GPIO_InitStruct.Pin = GPIO_PIN_11 | GPIO_PIN_12;
  GPIO_InitStruct.Speed = GPIO_SPEED_HIGH;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Alternate = GPIO_AF10_OTG_FS;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  // Configure VBUS Pin
  GPIO_InitStruct.Pin = GPIO_PIN_9;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  // ID Pin
  GPIO_InitStruct.Pin = GPIO_PIN_10;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_OD;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  GPIO_InitStruct.Speed = GPIO_SPEED_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF10_OTG_FS;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  // Enable USB OTG clock
  __HAL_RCC_USB_OTG_FS_CLK_ENABLE();

  // STM32F401 doesn't use VBUS sense (B device); explicitly disable it
  USB_OTG_FS->GCCFG |= USB_OTG_GCCFG_NOVBUSSENS;
  USB_OTG_FS->GCCFG &= ~USB_OTG_GCCFG_VBUSBSEN;
  USB_OTG_FS->GCCFG &= ~USB_OTG_GCCFG_VBUSASEN;

  /* prepare FAT filesystem */
  FATFS fat;

  disk_initialize((BYTE) 0);
  FRESULT ret = f_mount(&fat, "", 0);

  if (ret != FR_OK) {
    error_status = EEM_ERR_SD_CARD;
    Error_Handler();
  }

  f_setlabel(MSC_VOLUME_LABEL);

  tusb_init();

  while (TRUE) {
    tud_task();
    cdc_task();
  }
}


/******************************************************************************
 * TinyUSB device descriptors
 *****************************************************************************/
#include "bsp/board_api.h"

/* A combination of interfaces must have a unique product id, since PC will save device driver after the first plug.
 * Same VID/PID with different interface e.g MSC (first), then CDC (later) will possibly cause system error on PC.
 */
#define _PID_MAP(itf, n)  ( (CFG_TUD_##itf) << (n) )
#define USB_PID           (0x0500 | _PID_MAP(CDC, 0) | _PID_MAP(MSC, 1))

#define USB_VID   0x1999
#define USB_BCD   0x0200

tusb_desc_device_t const desc_device = {
  .bLength            = sizeof(tusb_desc_device_t),
  .bDescriptorType    = TUSB_DESC_DEVICE,
  .bcdUSB             = USB_BCD,

  // Use Interface Association Descriptor (IAD) for CDC
  // As required by USB Specs IAD's subclass must be common class (2) and protocol must be IAD (1)
  .bDeviceClass       = TUSB_CLASS_MISC,
  .bDeviceSubClass    = MISC_SUBCLASS_COMMON,
  .bDeviceProtocol    = MISC_PROTOCOL_IAD,

  .bMaxPacketSize0    = CFG_TUD_ENDPOINT0_SIZE,

  .idVendor           = USB_VID,
  .idProduct          = USB_PID,
  .bcdDevice          = 0x0100,

  .iManufacturer      = 0x01,
  .iProduct           = 0x02,
  .iSerialNumber      = 0x03,

  .bNumConfigurations = 0x01
};

// invoked when received GET DEVICE DESCRIPTOR
uint8_t const *tud_descriptor_device_cb(void) {
  return (uint8_t const *) &desc_device;
}

enum {
  ITF_NUM_CDC = 0,
  ITF_NUM_CDC_DATA,
  ITF_NUM_MSC,
  ITF_NUM_TOTAL
};

#define EPNUM_CDC_NOTIF   0x81
#define EPNUM_CDC_OUT     0x02
#define EPNUM_CDC_IN      0x82

#define EPNUM_MSC_OUT     0x03
#define EPNUM_MSC_IN      0x83

#define CONFIG_TOTAL_LEN    (TUD_CONFIG_DESC_LEN + TUD_CDC_DESC_LEN + TUD_MSC_DESC_LEN)

uint8_t const desc_fs_configuration[] = {
  // Config number, interface count, string index, total length, attribute, power in mA
  TUD_CONFIG_DESCRIPTOR(1, ITF_NUM_TOTAL, 0, CONFIG_TOTAL_LEN, 0x00, 100),

  // Interface number, string index, EP notification address and size, EP data address (out, in) and size.
  TUD_CDC_DESCRIPTOR(ITF_NUM_CDC, 4, EPNUM_CDC_NOTIF, 8, EPNUM_CDC_OUT, EPNUM_CDC_IN, 64),

  // Interface number, string index, EP Out & EP In address, EP size
  TUD_MSC_DESCRIPTOR(ITF_NUM_MSC, 5, EPNUM_MSC_OUT, EPNUM_MSC_IN, 64),
};

// invoked when received GET CONFIGURATION DESCRIPTOR
uint8_t const *tud_descriptor_configuration_cb(uint8_t index) {
  (void) index; // for multiple configurations
  return desc_fs_configuration;
}

// string descriptor index
enum {
  STRID_LANGID = 0,
  STRID_MANUFACTURER,
  STRID_PRODUCT,
  STRID_SERIAL,
};

char const *string_desc_arr[] = {
  (const char[]) { 0x09, 0x04 }, // 0: is supported language is English (0x0409)
  "LUFT-AQUILA",                 // 1: Manufacturer
  "FSK-EEM",                     // 2: Product
  NULL,                          // 3: Serials will use unique ID if possible
  "FSK-EEM CDC",                 // 4: CDC Interface
  "FSK-EEM MSC",                 // 5: MSC Interface
};

static uint16_t _desc_str[32 + 1];

// Invoked when received GET STRING DESCRIPTOR request
uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid) {
  (void) langid;
  size_t chr_count;

  switch (index) {
    case STRID_LANGID:
      memcpy(&_desc_str[1], string_desc_arr[0], 2);
      chr_count = 1;
      break;

    case STRID_SERIAL:
      chr_count = board_usb_get_serial(_desc_str + 1, 32);
      break;

    default:
      // Note: the 0xEE index string is a Microsoft OS 1.0 Descriptors.
      // https://docs.microsoft.com/en-us/windows-hardware/drivers/usbcon/microsoft-defined-usb-descriptors

      if (!(index < sizeof(string_desc_arr) / sizeof(string_desc_arr[0]))) {
        return NULL;
      }

      const char *str = string_desc_arr[index];

      // Cap at max char
      chr_count = strlen(str);
      size_t const max_count = sizeof(_desc_str) / sizeof(_desc_str[0]) - 1; // -1 for string type
      if ( chr_count > max_count ) chr_count = max_count;

      // Convert ASCII string into UTF-16
      for ( size_t i = 0; i < chr_count; i++ ) {
        _desc_str[1 + i] = str[i];
      }

      break;
  }

  // first byte is length (including header), second byte is string type
  _desc_str[0] = (uint16_t) ((TUSB_DESC_STRING << 8) | (2 * chr_count + 2));

  return _desc_str;
}


/******************************************************************************
 * USB device callbacks
 *****************************************************************************/
// device mount event
void tud_mount_cb(void) {
  return;
}

// device unmount event
void tud_umount_cb(void) {
  return;
}

// USB bus suspend event
void tud_suspend_cb(bool remote_wakeup_en) {
  // remote_wakeup_en : if host allow us  to perform remote wakeup
  // Within 7ms, device must draw an average of current less than 2.5 mA from bus
  (void) remote_wakeup_en;
  return;
}

// USB bus resume event
void tud_resume_cb(void) {
  return;
}


/******************************************************************************
 * USB CDC task and callbacks
 *****************************************************************************/
void cdc_task(void) {
  if (!tud_cdc_available()) {
    return;
  }

  usb_cmd_t rcv;
  usb_res_t res;
  res.magic = USB_RES_MAGIC;

  // cmd from host is smaller than the CDC buffer; data should be at the beginning
  uint32_t count = tud_cdc_read(&rcv, sizeof(rcv));
  tud_cdc_read_flush(); // flush unread data

  if (rcv.magic == USB_CMD_MAGIC && count == sizeof(usb_cmd_t)) {
    switch (rcv.cmd) {
      case USB_CMD_HELLO: {
        tud_cdc_write(uid, 12); // 96-bit UID
        tud_cdc_write_flush();
        return;
      }

      case USB_CMD_RTC: {
        RTC_DateTypeDef date;
        RTC_TimeTypeDef time;

        date.Year = rcv.data[0];
        date.Month = rcv.data[1]; // should be hex encoded
        date.Date = rcv.data[2];
        time.Hours = rcv.data[3];
        time.Minutes = rcv.data[4];
        time.Seconds = rcv.data[5];

        date.WeekDay = 0; // will be automatically calculated

        if (HAL_RTC_SetTime(&hrtc, &time, FORMAT_BIN) != HAL_OK) {
          res.res = USB_RES_ERR_UNKNOWN;
          break;
        }

        if (HAL_RTC_SetDate(&hrtc, &date, FORMAT_BIN) != HAL_OK) {
          res.res = USB_RES_ERR_UNKNOWN;
          break;
        }

        res.res = USB_RES_OK;
        break;
      }

      case USB_CMD_DEL: {
        FRESULT ret;

        DIR dir;
        FILINFO finfo;

        if (f_findfirst(&dir, &finfo, "", "*.log") != FR_OK) {
          res.res = USB_RES_ERR_UNKNOWN;
          break;
        }

        do {
          f_unlink(finfo.fname);
          ret = f_findnext(&dir, &finfo);
        } while (ret == FR_OK && finfo.fname[0]);

        res.res = USB_RES_OK;
        break;
      }

      default:
        res.res = USB_RES_ERR_INVALID;
        break;
    }
  } else {
    res.res = USB_RES_ERR_INVALID;
  }

  tud_cdc_write(&res, sizeof(res));
  tud_cdc_write_flush();
  return;
}

// device CDC line state changed callback. e.g connected/disconnected
void tud_cdc_line_state_cb(uint8_t itf, bool dtr, bool rts) {
  (void) itf;
  (void) rts;
}

// device CDC data receive from host callback
void tud_cdc_rx_cb(uint8_t itf) {
  (void) itf;
}


/******************************************************************************
 * USB MSC callbacks
 *****************************************************************************/
#if defined(SDMMC_DATATIMEOUT)
  #define SD_TIMEOUT SDMMC_DATATIMEOUT
#elif defined(SD_DATATIMEOUT)
  #define SD_TIMEOUT SD_DATATIMEOUT
#else
  #define SD_TIMEOUT 30 * 1000
#endif

// whether host does safe-eject
static bool ejected = false;

// invoked when received SCSI_CMD_INQUIRY
// Application fill vendor id, product id and revision with string up to 8, 16, 4 characters respectively
void tud_msc_inquiry_cb(uint8_t lun, uint8_t vendor_id[8], uint8_t product_id[16], uint8_t product_rev[4]) {
  (void) lun;

  const char vid[] = "FSK-EEM";
  const char pid[] = "Record Storage";
  const char rev[] = "1.0";

  memcpy(vendor_id  , vid, strlen(vid));
  memcpy(product_id , pid, strlen(pid));
  memcpy(product_rev, rev, strlen(rev));
}

// invoked when received Test Unit Ready command.
// return true allowing host to read/write this LUN e.g SD card inserted
bool tud_msc_test_unit_ready_cb(uint8_t lun) {
  (void) lun;

  if (ejected) {
    // Additional Sense 3A-00 is NOT_FOUND
    tud_msc_set_sense(lun, SCSI_SENSE_NOT_READY, 0x3a, 0x00);
    return false;
  }

  return true;
}

// invoked when received SCSI_CMD_READ_CAPACITY_10 and SCSI_CMD_READ_FORMAT_CAPACITY to determine the disk size
// Application update block count and block size
void tud_msc_capacity_cb(uint8_t lun, uint32_t* block_count, uint16_t* block_size) {
  (void) lun;

  BSP_SD_CardInfo card;
  BSP_SD_GetCardInfo(&card);

  *block_count = card.LogBlockNbr - 1;
  *block_size  = card.LogBlockSize;
}

// invoked when received Start Stop Unit command
// - Start = 0 : stopped power mode, if load_eject = 1 : unload disk storage
// - Start = 1 : active mode, if load_eject = 1 : load disk storage
bool tud_msc_start_stop_cb(uint8_t lun, uint8_t power_condition, bool start, bool load_eject) {
  (void) lun;
  (void) power_condition;

  if (load_eject) {
    if (start) {
      // load disk storage
    } else {
      // unload disk storage
      ejected = true;
    }
  }

  return true;
}

// invoked when received READ10 command.
// Copy disk's data to buffer (up to bufsize) and return number of copied bytes.
int32_t tud_msc_read10_cb(uint8_t lun, uint32_t lba, uint32_t offset, void* buffer, uint32_t bufsize) {
  BSP_SD_CardInfo card;
  BSP_SD_GetCardInfo(&card);

  if (lba >= card.LogBlockNbr) {
    return -1;
  }

  (void) offset; // should be 0 when MSC buffer is larger than a block size

  if (BSP_SD_ReadBlocks(buffer, lba, bufsize >> 9, SD_TIMEOUT) != MSD_OK) { // divide by 512 to get block count
    return -1;
  }

  /* wait until the read operation is finished */
  while(BSP_SD_GetCardState()!= MSD_OK);

  return (int32_t) bufsize;
}

bool tud_msc_is_writable_cb (uint8_t lun) {
  (void) lun;
  return false; // read-only
}

// invoked when received WRITE10 command.
// Process data in buffer to disk's storage and return number of written bytes
int32_t tud_msc_write10_cb(uint8_t lun, uint32_t lba, uint32_t offset, uint8_t* buffer, uint32_t bufsize) {
  (void) lun;
  (void) lba;
  (void) offset;
  (void) buffer;
  return (int32_t) -1; // read-only
}

// invoked when received an SCSI command not in built-in list below
// - READ_CAPACITY10, READ_FORMAT_CAPACITY, INQUIRY, MODE_SENSE6, REQUEST_SENSE
// - READ10 and WRITE10 has their own callbacks
int32_t tud_msc_scsi_cb (uint8_t lun, uint8_t const scsi_cmd[16], void* buffer, uint16_t bufsize) {
  void const* response = NULL;
  int32_t resplen = 0;

  // most scsi handled is input
  bool in_xfer = true;

  switch (scsi_cmd[0]) {
    default:
      // Set Sense = Invalid Command Operation
      tud_msc_set_sense(lun, SCSI_SENSE_ILLEGAL_REQUEST, 0x20, 0x00);

      // negative means error -> tinyusb could stall and/or response with failed status
      resplen = -1;
    break;
  }

  // return resplen must not larger than bufsize
  if (resplen > bufsize) {
    resplen = bufsize;
  }

  if (response && (resplen > 0)) {
    if(in_xfer) {
      memcpy(buffer, response, (size_t) resplen);
    } else {
      // SCSI output
    }
  }

  return (int32_t) resplen;
}
