/* energymeter common functions */
#include <stdio.h>

#include "ff.h"
#include "adc.h"
#include "rtc.h"
#include "main.h"
#include "energymeter.h"

uint32_t uid[3]; // device unique 96-bit UID
uint32_t mode;   // module operation mode

extern volatile uint32_t adc_flag;
extern uint32_t adc[];

char filename[_MAX_LFN + 1];

void energymeter_init(void) {
  // wait for enough VBUS voltage to judge the mode
  HAL_Delay(300);

  // read 96-bit device UID
  uid[0] = HAL_GetUIDw0();
  uid[1] = HAL_GetUIDw1();
  uid[2] = HAL_GetUIDw2();

  DEBUG_MSG("UID : %08lX-%08lX-%08lX\n", uid[0], uid[1], uid[2]);

  // read LV voltage to determine the mode
  HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
  while (adc_flag != TRUE);
  adc_flag = FALSE;

  // if LV < 6V, the VBUS is not present and is powered by USB
  if (adc[ADC_LV_VOLTAGE] < 600) { // 0.01 V unit
    DEBUG_MSG("MODE: USB\n");
    mode = EEM_MODE_USB;

    energymeter_usb();
  } else {
    DEBUG_MSG("MODE: RECORD\n");
    mode = EEM_MODE_RECORD;

    // read boot time from RTC
    RTC_DateTypeDef date;
    RTC_TimeTypeDef time;

    HAL_RTC_GetTime(&hrtc, &time, FORMAT_BIN);
    HAL_RTC_GetDate(&hrtc, &date, FORMAT_BIN);

    sprintf(filename, "20%02d-%02d-%02d-%02d-%02d-%02d %08lX-%08lX-%08lX.log",
            date.Year, date.Month, date.Date, time.Hours, time.Minutes, time.Seconds,
            uid[0], uid[1], uid[2]);

    DEBUG_MSG("LOG : %s\n", filename);

    energymeter_record(filename);
  }
}
