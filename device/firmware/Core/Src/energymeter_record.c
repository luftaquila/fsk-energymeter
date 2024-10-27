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

volatile uint32_t adc_flag; // adc conversion flag
uint32_t adc[ADC_CH_CNT];   // adc conversion buffer
float adc_mv[ADC_CH_CNT];   // adc mV calc buffer

void energymeter_record(char *filename) {
  FATFS fat;

  disk_initialize((BYTE) 0);
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

  HAL_TIM_Base_Start_IT(&htim5); // start 10 ms timer

  while (TRUE) {
    // 10 ms timer
    if (timer_flag) {
      HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
      while (adc_flag != TRUE); // poll until ADC conv done; nothing to do

      log.timestamp = HAL_GetTick(); // boot sequence may take ~500ms; take granted for the error
      log.packet.record.hv_voltage = adc[ADC_HV_VOLTAGE];
      log.packet.record.hv_current = adc[ADC_HV_CURRENT];
      log.packet.record.lv_voltage = adc[ADC_LV_VOLTAGE];
      log.packet.record.temperature = adc[ADC_TEMP];

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
  adc[ADC_LV_VOLTAGE] = (uint16_t)(adc_mv[ADC_LV_VOLTAGE] * VOLTAGE_DIVIDER_RATIO_LV / 10.0f); // 0.01 V
  adc[ADC_HV_CURRENT] = (uint16_t)((adc_mv[ADC_HV_CURRENT] - adc_mv[ADC_5V_REF]) * 4.0f);      // 0.1 A, signed. (* 4 = / 1500 * 600 * 10)
  adc[ADC_HV_VOLTAGE] = (uint16_t)(adc_mv[ADC_HV_VOLTAGE] * VOLTAGE_DIVIDER_RATIO_HV / 10.0f); // 0.01 V

  // temperature calculation
  adc[ADC_TEMP] = (uint16_t)(((float)(TEMPSENSOR_CAL2_TEMP - TEMPSENSOR_CAL1_TEMP) / (float)(*TEMPSENSOR_CAL2_ADDR - *TEMPSENSOR_CAL1_ADDR) * (adc[ADC_TEMP] - (float)(*TEMPSENSOR_CAL1_ADDR)) + (float)(TEMPSENSOR_CAL1_TEMP)) * 100.0f); // 0.01 °C

  adc_flag = TRUE;

  // #ifdef DISABLED
  #ifdef DEBUG
  if (tim_cnt == 0) {
    DEBUG_MSG("[%8lu] Vref: %.2f V\r\n%*cLV  : %.2f V\r\n%*cHV  : %.2f V / %.2f A\r\n%*cTEMP: %.2f °C\r\n",
              HAL_GetTick(), adc_mv[ADC_VREFINT] / 1000.0f,
              11, ' ', adc[ADC_LV_VOLTAGE] / 100.0f,
              11, ' ', adc[ADC_HV_VOLTAGE] / 100.0f, adc[ADC_HV_CURRENT] / 100.0f,
              11, ' ', adc[ADC_TEMP] / 100.0f);
  }
  #endif
  // #endif
}
