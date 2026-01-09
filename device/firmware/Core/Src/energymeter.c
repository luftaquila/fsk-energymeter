/* energymeter common functions */
#include <stdio.h>

#include "ff.h"
#include "adc.h"
#include "rtc.h"
#include "main.h"
#include "energymeter.h"

extern volatile uint32_t adc_flag;
extern uint32_t adc[];
extern int16_t adc_calc[];

header_t header;

void energymeter_init(void) {
  // read boot time from RTC
  RTC_DateTypeDef date;
  RTC_TimeTypeDef time;

  HAL_RTC_GetTime(&hrtc, &time, RTC_FORMAT_BIN);
  HAL_RTC_GetDate(&hrtc, &date, RTC_FORMAT_BIN);

  header.magic = LOG_MAGIC;
  header.type = LOG_TYPE_HEADER;

  header.uid[0] = HAL_GetUIDw0();
  header.uid[1] = HAL_GetUIDw1();
  header.uid[2] = HAL_GetUIDw2();

  header.year = date.Year;
  header.month = date.Month;
  header.day = date.Date;
  header.hour = time.Hours;
  header.minute = time.Minutes;
  header.second = time.Seconds;
  header.millisecond = ((time.SecondFraction - time.SubSeconds) * 1000) / (time.SecondFraction + 1);

  // wait for enough VBUS voltage charge to judge the mode
  HAL_Delay(270);

  // zero calibrate HV voltage and current. typically take 32 ms
  energymeter_calibrate();

  // read LV voltage to determine the mode
  HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
  while (adc_flag != TRUE);
  adc_flag = FALSE;

  // if LV < 6V, the VBUS is not present and is powered by USB
  if (adc_calc[ADC_LV_VOLTAGE] < 600) { // 0.01 V unit
    DEBUG_MSG("MODE: USB\r\n");
    energymeter_usb();
  } else {
    DEBUG_MSG("MODE: RECORD\r\n");
    energymeter_record();
  }
}
