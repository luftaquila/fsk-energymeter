/* energymeter common functions */

#include "adc.h"
#include "tim.h"
#include "main.h"
#include "ssd1306.h"
#include "energymeter.h"

volatile uint32_t adc_flag;   // adc conversion flag
volatile uint32_t timer_flag; // 10 ms timer flag

uint32_t adc[ADC_CH_CNT]; // adc conversion buffer

float hv_voltage;
float hv_voltage_cal;

// get ADC value at 0V
void energymeter_calibrate(void) {
  float v = 0;

  for (int i = 0; i < ADC_AVG_CNT; i++) {
    HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
    while (adc_flag != TRUE);

    v += hv_voltage;

    adc_flag = FALSE;
    HAL_Delay(1);
  }

  hv_voltage_cal = v / ADC_AVG_CNT;
}

void energymeter_init(void) {
  HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, GPIO_PIN_SET);
  ssd1306_Init();

  // wait for enough VBUS voltage charge to judge the mode
  HAL_Delay(270);

  // zero calibrate HV voltage and current. typically take 32 ms
  energymeter_calibrate();

  // mark ready
  for (int i = 0; i < 6; i++) {
    HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);
    HAL_Delay(100);
  }

  HAL_TIM_Base_Start_IT(&htim5); // start 10 ms timer
  energymeter_record();
}

void energymeter_record(void) {
  while (TRUE) {
    // 10 ms timer
    if (timer_flag) {
      float avg = 0;

      for (int i = 0; i < ADC_AVG_CNT; i++) {
        HAL_ADC_Start_DMA(&hadc1, adc, ADC_CH_CNT);
        while (adc_flag != TRUE); // poll until ADC conv done

        avg += hv_voltage;
        adc_flag = FALSE;
      }

      // TODO: process adc data

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
  float vrefint = (float)VREFINT_CAL_VREF * (float)(*VREFINT_CAL_ADDR) / (float)adc[ADC_VREFINT];

  // calibrate HV with Vref
  float hv_volt = vrefint * (float)adc[ADC_HV_VOLTAGE] / (float)((1 << ADC_RES) - 1);

  // actual HV calculation
  hv_voltage = (hv_volt * VOLTAGE_DIVIDER_RATIO_HV / 100.0f) - hv_voltage_cal;

  adc_flag = TRUE;
}
