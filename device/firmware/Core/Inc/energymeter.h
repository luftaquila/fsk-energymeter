#ifndef ENERGYMETER_H
#define ENERGYMETER_H

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
 * ADC temperature calibration values and channels
 *****************************************************************************/
enum {
  ADC_HV_VOLTAGE,
  ADC_VREFINT,
  ADC_CH_CNT
};

#define VOLTAGE_DIVIDER_RATIO_HV    300.0f

#define ADC_AVG_EXP 4
#define ADC_AVG_CNT (1 << ADC_AVG_EXP)

#define ADC_RES 12 // ADC bit resolution


/******************************************************************************
 * function prototypes
 *****************************************************************************/
void energymeter_init(void);
void energymeter_record(void);
void energymeter_calibrate(void);

#endif /* ENERGYMETER_H */
