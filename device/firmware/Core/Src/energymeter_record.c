#include <stdio.h>

#include "ff.h"
#include "diskio.h"
#include "adc.h"
#include "tim.h"
#include "main.h"
#include "energymeter.h"

extern uint32_t error_status;

uint32_t timer_flag; // 10 ms timer flag
uint32_t sync_flag;  // 1000 ms timer flag
uint32_t tim_cnt;    // 1000 ms counter

volatile uint32_t adc_flag;   // adc conversion flag
uint32_t adc[ADC_CH_CNT];     // adc conversion buffer
int16_t adc_calc[ADC_CH_CNT]; // adc real value buffer
float adc_mv[ADC_CH_CNT];     // adc mV calc buffer

float hv_voltage_cal;
float hv_current_cal;

void energymeter_record(char *filename) {
  energymeter_calibrate();

  disk_initialize((BYTE) 0);

  FATFS fat;
  FRESULT ret = f_mount(&fat, "", 0);

  if (ret != FR_OK) {
    error_status = EEM_ERR_SD_CARD;
    Error_Handler();
  }

  FIL file;
  ret = f_open(&file, filename, FA_OPEN_APPEND | FA_WRITE);

  if (ret != FR_OK) {
    error_status = EEM_ERR_SD_CARD;
    Error_Handler();
  }

  log_t log;
  log.type = LOG_TYPE_RECORD;
  log.magic = LOG_MAGIC;

  UINT written;
  int32_t adc_avg[ADC_CH_CNT];

  HAL_TIM_Base_Start_IT(&htim5); // start 10 ms timer

  while (TRUE) {
    // 10 ms timer
    if (timer_flag) {
      // reset all average buffers
      adc_avg[ADC_LV_VOLTAGE] = 0;
      adc_avg[ADC_HV_CURRENT] = 0;
      adc_avg[ADC_HV_VOLTAGE] = 0;
      adc_avg[ADC_TEMP] = 0;

      // ADC measurement average calculation
      for (int i = 0; i < ADC_AVG_CNT; i++) {
        HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
        while (adc_flag != TRUE); // poll until ADC conv done

        adc_avg[ADC_LV_VOLTAGE] += adc_calc[ADC_LV_VOLTAGE];
        adc_avg[ADC_HV_CURRENT] += adc_calc[ADC_HV_CURRENT];
        adc_avg[ADC_HV_VOLTAGE] += adc_calc[ADC_HV_VOLTAGE];
        adc_avg[ADC_TEMP] += adc_calc[ADC_TEMP];

        adc_flag = FALSE;
      }

      log.timestamp = HAL_GetTick(); // boot sequence take ~700ms; take grant for the error
      log.packet.record.hv_voltage = (int16_t)(adc_avg[ADC_HV_VOLTAGE] >> ADC_AVG_EXP);
      log.packet.record.hv_current = (int16_t)(adc_avg[ADC_HV_CURRENT] >> ADC_AVG_EXP);
      log.packet.record.lv_voltage = (int16_t)(adc_avg[ADC_LV_VOLTAGE] >> ADC_AVG_EXP);
      log.packet.record.temperature = (int16_t)(adc_avg[ADC_TEMP] >> ADC_AVG_EXP);

      // checksum calculation
      log.checksum = 0;
      log.checksum += *(uint16_t *)&log;
      log.checksum += *((uint16_t *)&log + 2);
      log.checksum += *((uint16_t *)&log + 3);
      log.checksum += *((uint16_t *)&log + 4);
      log.checksum += *((uint16_t *)&log + 5);
      log.checksum += *((uint16_t *)&log + 6);
      log.checksum += *((uint16_t *)&log + 7);
      log.checksum = ~log.checksum;

      // won't handle error; better keep retrying on failure
      ret = f_write(&file, &log, sizeof(log_t), &written);

      adc_flag = FALSE;
      timer_flag = FALSE;
    }

    // 100 ms timer
    if (sync_flag) {
      // won't handle error; better keep retrying on failure
      f_sync(&file); // typically take 4 ms; worst 10 ms once in 2~3 seconds
      sync_flag = FALSE;

      HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin); // LED indicator
    }
  }
}

// get ADC values at 0V, 0A
void energymeter_calibrate(void) {
  float v = 0, c = 0;

  for (int i = 0; i < ADC_AVG_CNT; i++) {
    HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
    while (adc_flag != TRUE);

    v += (float)adc_calc[ADC_HV_VOLTAGE];
    c += (float)adc_calc[ADC_HV_CURRENT];

    adc_flag = FALSE;
    HAL_Delay(1);
  }

  hv_voltage_cal = v / ADC_AVG_CNT;
  hv_current_cal = c / ADC_AVG_CNT;

  #ifdef DEBUG
  DEBUG_MSG("CAL: x%d, %.2f V, %.2f A\r\n", ADC_AVG_CNT, hv_voltage_cal / 10.0f, hv_current_cal / 10.0f);
  #endif
}

// 10ms TIM5 callback
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
  timer_flag = TRUE;

  // 100 ms elapsed
  if (++tim_cnt >= 10) {
    sync_flag = TRUE;
    tim_cnt = 0;
  }
}

// ADC conversion callback
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc) {
  // Vref calculation
  adc_mv[ADC_VREFINT] = (float)VREFINT_CAL_VREF * (float)(*VREFINT_CAL_ADDR) / (float)adc[ADC_VREFINT];

  // ADC channel voltage calculation
  adc_mv[ADC_LV_VOLTAGE] = adc_mv[ADC_VREFINT] * (float)adc[ADC_LV_VOLTAGE] / (float)((1 << ADC_RES) - 1);
  adc_mv[ADC_5V_REF] = adc_mv[ADC_VREFINT] * (float)adc[ADC_5V_REF] / (float)((1 << ADC_RES) - 1);
  adc_mv[ADC_HV_CURRENT] = adc_mv[ADC_VREFINT] * (float)adc[ADC_HV_CURRENT] / (float)((1 << ADC_RES) - 1);
  adc_mv[ADC_HV_VOLTAGE] = adc_mv[ADC_VREFINT] * (float)adc[ADC_HV_VOLTAGE] / (float)((1 << ADC_RES) - 1);

  // actual value calculation
  adc_calc[ADC_LV_VOLTAGE] = (int16_t)(adc_mv[ADC_LV_VOLTAGE] * VOLTAGE_DIVIDER_RATIO_LV / 10.0f);
  adc_calc[ADC_HV_CURRENT] = (int16_t)((((adc_mv[ADC_HV_CURRENT] * VOLTAGE_DIVIDER_RATIO_HV_C) - adc_mv[ADC_5V_REF]) * 4.0f) - hv_current_cal);
  adc_calc[ADC_HV_VOLTAGE] = (int16_t)((adc_mv[ADC_HV_VOLTAGE] * VOLTAGE_DIVIDER_RATIO_HV / 100.0f) - hv_voltage_cal);

  // temperature calculation
  adc_calc[ADC_TEMP] = (int16_t)(((float)(TEMPSENSOR_CAL2_TEMP - TEMPSENSOR_CAL1_TEMP) / (float)(*TEMPSENSOR_CAL2_ADDR - *TEMPSENSOR_CAL1_ADDR) * (adc[ADC_TEMP] - (float)(*TEMPSENSOR_CAL1_ADDR)) + (float)(TEMPSENSOR_CAL1_TEMP)) * 100.0f);

  adc_flag = TRUE;

  // #ifdef DISABLED
  #ifdef DEBUG
  if (tim_cnt == 0) {
    DEBUG_MSG("[%8lu] Vref: %f mV\r\n%*cLV  : %.2f V\r\n%*cHV  : %.1f V / %.1f A\r\n%*cVREF: %f mV\r\n%*cTEMP: %.2f °C\r\n",
              HAL_GetTick(), adc_mv[ADC_VREFINT],
              11, ' ', adc_calc[ADC_LV_VOLTAGE] / 100.0f,
              11, ' ', (int16_t)adc_calc[ADC_HV_VOLTAGE] / 10.0f, (int16_t)adc_calc[ADC_HV_CURRENT] / 10.0f,
              11, ' ', adc_mv[ADC_5V_REF],
              11, ' ', adc_calc[ADC_TEMP] / 100.0f);
  }
  #endif
  // #endif
}
