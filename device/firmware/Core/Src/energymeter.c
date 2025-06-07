/* energymeter common functions */

#include <stdio.h>

#include "adc.h"
#include "tim.h"
#include "main.h"
#include "energymeter.h"

#include "ssd1306.h"
#include "ssd1306_fonts.h"

volatile uint32_t adc_flag;   // adc conversion flag
volatile uint32_t timer_flag; // 10 ms timer flag

uint32_t adc[ADC_CH_CNT]; // adc conversion buffer

float hv_voltage;
float hv_voltage_cal = 0.0f;

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

  // zero calibrate HV voltage
  energymeter_calibrate();

  ssd1306_SetCursor(37, 22);
  ssd1306_WriteString("READY", Font_11x18, White);
  ssd1306_UpdateScreen();

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

      energymeter_sample(avg / ADC_AVG_CNT, HAL_GetTick());
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
  float vrefint_mv = (float)VREFINT_CAL_VREF * (float)(*VREFINT_CAL_ADDR) / (float)adc[ADC_VREFINT];

  // calibrate HV with Vref
  float hv_adc_mv = vrefint_mv * (float)adc[ADC_HV_VOLTAGE] / (float)((1 << ADC_RES) - 1);

  // actual HV calculation
  hv_voltage = (hv_adc_mv * VOLTAGE_DIVIDER_RATIO_HV / 1000.0f) - hv_voltage_cal;

  adc_flag = TRUE;
}
