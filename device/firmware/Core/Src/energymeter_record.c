#include "ff.h"
#include "diskio.h"
#include "adc.h"
#include "crc.h"
#include "main.h"
#include "energymeter.h"

uint32_t timer_flag; // 10 ms timer flag
uint32_t sync_flag;  // 1000 ms timer flag
uint32_t tim_cnt;    // 1000 ms counter

extern uint32_t adc_flag;
extern uint32_t adc[];

void energymeter_record(char *filename, uint32_t boot) {
  FATFS fat;

  disk_initialize((BYTE) 0);
  FRESULT ret = f_mount(&fat, "", 0);

  if (ret != FR_OK) {
    Error_Handler();
  }

  FIL file;

  ret = f_open(&file, filename, FA_OPEN_APPEND | FA_WRITE);

  if (ret != FR_OK) {
    Error_Handler();
  }

  log_t log;
  log.type = LOG_TYPE_RECORD;
  log.magic = LOG_MAGIC;

  UINT written;

  while (TRUE) {
    // 10 ms timer
    if (timer_flag) {
      HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
      while (adc_flag != TRUE); // poll until ADC conv done; nothing to do

      log.timestamp = HAL_GetTick() - boot;
      log.packet.record.hv_voltage = adc[ADC_HV_VOLTAGE];
      log.packet.record.hv_current = adc[ADC_HV_CURRENT];
      log.packet.record.lv_voltage = adc[ADC_LV_VOLTAGE];
      log.packet.record.temperature = adc[ADC_TEMP];

      // take lower 16 bit of the CRC32
      log.checksum = 0;
      log.checksum = HAL_CRC_Calculate(&hcrc, (uint32_t *)&log, sizeof(log_t) / sizeof(uint32_t)) & 0xFFFF;

      ret = f_write(&file, &log, sizeof(log_t), &written);

      if (ret != FR_OK || written != sizeof(log_t)) {
        // todo: sd write error handling
      }

      adc_flag = FALSE;
      timer_flag = FALSE;
    }

    // 1000 ms timer
    if (sync_flag) {
      f_sync(&file);
      sync_flag = FALSE;

      HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin); // LED indicator
    }
  }
}

// 10ms TIM5 callback
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
  timer_flag = TRUE;

  // 1000 ms elapsed
  if (++tim_cnt >= 100) {
    sync_flag = TRUE;
    tim_cnt = 0;
  }
}

// ADC conversion callback
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc) {
  // TODO: calibration
  float vref = 3.3 * VREFIN_CAL / adc[ADC_VREFINT];
  (void) vref;

  adc[ADC_TEMP] = (uint16_t)(((110.0 - 30) * (adc[ADC_TEMP] - TS_CAL1) / (TS_CAL2 - TS_CAL1) + 30) * 100);
  adc_flag = TRUE;
}
