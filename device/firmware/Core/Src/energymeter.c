/* energymeter common functions */

#include "adc.h"
#include "tim.h"
#include "main.h"
#include "energymeter.h"

volatile uint32_t adc_flag;   // adc conversion flag
uint32_t timer_flag; // 10 ms timer flag

uint32_t adc[ADC_CH_CNT];     // adc conversion buffer
int16_t adc_calc[ADC_CH_CNT]; // adc real value buffer
float adc_mv[ADC_CH_CNT];     // adc mV calc buffer

float hv_voltage_cal;

void energymeter_init(void) {
  // wait for enough VBUS voltage charge to judge the mode
  HAL_Delay(270);

  // zero calibrate HV voltage and current. typically take 32 ms
  energymeter_calibrate();

  energymeter_record();
}

// get ADC values at 0V, 0A
void energymeter_calibrate(void) {
  float v = 0;

  for (int i = 0; i < ADC_AVG_CNT; i++) {
    HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
    while (adc_flag != TRUE);

    v += (float)adc_calc[ADC_HV_VOLTAGE];

    adc_flag = FALSE;
    HAL_Delay(1);
  }

  hv_voltage_cal = v / ADC_AVG_CNT;
}

void energymeter_record(void) {
  int32_t adc_avg[ADC_CH_CNT];

  HAL_TIM_Base_Start_IT(&htim5); // start 10 ms timer

  while (TRUE) {
    // 10 ms timer
    if (timer_flag) {
      // reset all average buffers
      adc_avg[ADC_HV_VOLTAGE] = 0;

      // ADC measurement average calculation
      for (int i = 0; i < ADC_AVG_CNT; i++) {
        HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
        while (adc_flag != TRUE); // poll until ADC conv done

        adc_avg[ADC_HV_VOLTAGE] += adc_calc[ADC_HV_VOLTAGE];

        adc_flag = FALSE;
      }

      adc_flag = FALSE;
      timer_flag = FALSE;
    }
  }
}

// 10ms TIM5 callback
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
  timer_flag = TRUE;
}

// ADC conversion callback
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc) {
  // Vref calculation
  adc_mv[ADC_VREFINT] = (float)VREFINT_CAL_VREF * (float)(*VREFINT_CAL_ADDR) / (float)adc[ADC_VREFINT];

  // ADC channel voltage calculation
  adc_mv[ADC_HV_VOLTAGE] = adc_mv[ADC_VREFINT] * (float)adc[ADC_HV_VOLTAGE] / (float)((1 << ADC_RES) - 1);

  // actual value calculation
  adc_calc[ADC_HV_VOLTAGE] = (int16_t)((adc_mv[ADC_HV_VOLTAGE] * VOLTAGE_DIVIDER_RATIO_HV / 100.0f) - hv_voltage_cal);

  adc_flag = TRUE;
}
