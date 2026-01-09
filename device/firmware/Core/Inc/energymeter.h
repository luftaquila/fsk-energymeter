#ifndef ENERGYMETER_H
#define ENERGYMETER_H

#include "main.h"

/******************************************************************************
 * basic definitions
 *****************************************************************************/
#define TRUE  (1)
#define FALSE (0)

#define BIT_SET(target, pos)    ((target) |=  (1 << (pos)))
#define BIT_CLEAR(target, pos)  ((target) &= ~(1 << (pos)))
#define BIT_TOGGLE(target, pos) ((target) ^=  (1 << (pos)))
#define BIT_CHECK(target, pos)  ((target) &   (1 << (pos)))


/******************************************************************************
 * debug output
 *****************************************************************************/
#ifdef DEBUG
#define DEBUG_MSG(...) printf(__VA_ARGS__)
#else /* DEBUG */
#define DEBUG_MSG(...)
#endif /* DEBUG */


/******************************************************************************
 * module error status
 *****************************************************************************/
extern uint32_t error_status;

enum {
  EEM_ERR_UNKNOWN,
  EEM_ERR_HARDFAULT,
  EEM_ERR_SD_CARD,
  EEM_ERR_CNT
};


/******************************************************************************
 * log types and formats
 *****************************************************************************/
#define PROTOCOL_VERSION 0x02
#define LOG_MAGIC 0xAA

enum {
  LOG_TYPE_HEADER, // start header
  LOG_TYPE_RECORD, // 100 Hz report
  LOG_TYPE_EVENT,  // instant event
  LOG_TYPE_CNT
};

typedef struct {
  int16_t hv_voltage;  // 0.1 V
  int16_t hv_current;  // 0.1 A
  int16_t lv_voltage;  // 0.01 V
  int16_t temperature; // 0.01 °C
} __attribute__((packed, aligned(sizeof(uint32_t)))) log_record_t;

typedef struct {
  uint8_t type;    // event type
  uint8_t id;      // event ID
  uint8_t data[6]; // additional data fields
} __attribute__((packed, aligned(sizeof(uint32_t)))) log_event_t;

typedef struct {
  uint8_t magic;      // log packet magic sequence
  uint8_t type;       // log type
  uint16_t checksum;  // checksum
  uint32_t timestamp; // ms elapsed since boot
  union {
    log_record_t record;
    log_event_t event;
  } packet;
} __attribute__((packed, aligned(sizeof(uint32_t)))) log_t;

typedef struct {
  uint8_t magic;
  uint8_t type;
  uint16_t checksum;
  uint32_t timestamp;
  uint32_t uid[3]; // 96-bit device uid
  uint16_t v_cal;
  uint16_t c_cal;
  struct {
    uint8_t year;
    uint8_t month;
    uint8_t day;
    uint8_t hour;
    uint8_t minute;
    uint8_t second;
    uint16_t millisecond;
  }; // boot time
} __attribute__((packed, aligned(sizeof(uint32_t)))) header_t;


/******************************************************************************
 * ADC temperature calibration values and channels
 *****************************************************************************/
enum {
  ADC_LV_VOLTAGE,
  ADC_5V_REF,
  ADC_HV_CURRENT,
  ADC_HV_VOLTAGE,
  ADC_TEMP,
  ADC_VREFINT,
  ADC_CH_CNT
};

#define VOLTAGE_DIVIDER_RATIO_LV    10.0f
#define VOLTAGE_DIVIDER_RATIO_HV    300.0f
#define VOLTAGE_DIVIDER_RATIO_HV_C  (59.0f / 39.0f)
#define VOLTAGE_DIVIDER_RATIO_5VREF 2.0f

#define ADC_AVG_EXP 4
#define ADC_AVG_CNT (1 << ADC_AVG_EXP)

#define ADC_RES 12 // ADC bit resolution


/******************************************************************************
 * TinyUSB definitions
 *****************************************************************************/
#define MSC_VOLUME_LABEL "FSK-EEM"

#define USB_CMD_MAGIC 0xBB
#define USB_RES_MAGIC 0xCC

enum {
  USB_CMD_HELLO,
  USB_CMD_RTC,
  USB_CMD_DEL,
  USB_CMD_CNT,
};

typedef struct {
  uint8_t magic;
  uint8_t cmd;
  uint8_t data[6];
} usb_cmd_t;

enum {
  USB_RES_OK,
  USB_RES_ERR_UNKNOWN,
  USB_RES_ERR_INVALID,
};

typedef struct {
  uint8_t magic;
  uint8_t res;
  uint8_t data[2];
} usb_res_t;


/******************************************************************************
 * function prototypes
 *****************************************************************************/
void energymeter_init(void);
void energymeter_usb(void);
void energymeter_record(void);
void energymeter_calibrate(void);

/******************************************************************************
 * TinyUSB function prototypes
 *****************************************************************************/
void cdc_task(void);

#endif /* ENERGYMETER_H */
