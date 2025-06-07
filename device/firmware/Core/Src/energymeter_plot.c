/* energymeter datapoint plot functions */

#include <math.h>
#include <float.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>

#include "main.h"
#include "energymeter.h"

#include "ssd1306.h"
#include "ssd1306_fonts.h"

// moving average window size
#define WINDOW_POINT 5

// 1 minute datapoint buffer
#define BUF_SIZE 6000

// voltage thresholds of moving average
#define START_THRES 0.2f
#define STEEP_THRES 1.0f
#define END_THRES   0.1f

// minimum consecutive points for events
#define MIN_CONSEC_START 3
#define MIN_CONSEC_STEEP 1
#define MIN_CONSEC_END   10

// 500 ms before/end of event
#define CONTEXT_SAMPLES 50

// state machine
typedef enum {
  STATE_IDLE,
  STATE_DELTA,
  STATE_END,
} state_t;

typedef struct {
  int32_t start;
  int32_t steep;
  int32_t end;
} value_t;

typedef struct {
  float voltage;
  uint32_t timestamp;
} data_t;

// 1 minute buffer
data_t buf[BUF_SIZE];

// event index at threshold start
value_t idx = { -1, -1, -1 };

// calculate moving average with newest point
static inline float movavg(float new) {
  static float movavg_buf[WINDOW_POINT];
  static float movavg_sum = 0;
  static int32_t movavg_idx = 0;
  static int32_t movavg_cnt = 0;

  if (movavg_cnt < WINDOW_POINT) {
    movavg_buf[movavg_idx] = new;
    movavg_sum += new;
    movavg_cnt++;
  } else {
    movavg_sum -= movavg_buf[movavg_idx];
    movavg_sum += new;
    movavg_buf[movavg_idx] = new;
  }

  movavg_idx = (movavg_idx + 1) % WINDOW_POINT;

  return movavg_sum / (float)movavg_cnt;
}

// add new sample to the buffer
static inline int32_t push(float new, uint32_t ts) {
  static int32_t buf_idx = 0;
  static int32_t buf_cnt = 0;

  int32_t pos = buf_idx;

  buf[buf_idx].voltage = new;
  buf[buf_idx].timestamp = ts;
  buf_idx = (buf_idx + 1) % BUF_SIZE;

  if (buf_cnt < BUF_SIZE) {
    buf_cnt++;
  }

  return pos;
}

// process new sample
void energymeter_sample(float new, uint32_t ts) {
  static float prev = 0.0f;
  static bool is_first = TRUE;

  int32_t pos = push(new, ts);
  float movavg_new = movavg(new);

  if (is_first) {
    prev = movavg_new;
    is_first = FALSE;
    return;
  }

  static state_t state = STATE_IDLE;
  static value_t consec = { 0, 0, 0 };

  static float min = FLT_MAX;
  static float max = -FLT_MAX;

  float delta = movavg_new - prev;
  float delta_abs = fabsf(delta);

  switch (state) {
    case STATE_IDLE:
      if (delta_abs >= START_THRES) {
        consec.start++;

        if (idx.start < 0) {
          idx.start = pos;
        }

        if (consec.start >= MIN_CONSEC_START) {
          idx.steep = -1;
          idx.end = -1;

          consec.steep = 0;
          consec.end = 0;

          min = FLT_MAX;
          max = -FLT_MAX;

          state = STATE_DELTA;
          HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, GPIO_PIN_RESET);
        }
      } else {
        consec.start = 0;
        idx.start = -1;
      }
      break;

    case STATE_DELTA:
      if (delta_abs >= STEEP_THRES) {
        consec.steep++;

        if (idx.steep < 0 && consec.steep >= MIN_CONSEC_STEEP) {
          idx.steep = pos;
        }
      } else {
        consec.steep = 0;
      }

      if (delta_abs <= END_THRES) {
        consec.end++;

        if (idx.end < 0) {
          idx.end = pos;
        }

        if (consec.end >= MIN_CONSEC_END) {
          state = STATE_END;
        }
      } else {
        consec.end = 0;
        idx.end = -1;
      }
      break;

    case STATE_END: {
      int32_t margin = (pos - idx.end);
      margin += (margin < 0 ? BUF_SIZE : 0);

      if (margin > CONTEXT_SAMPLES) {
        state = STATE_IDLE;
        HAL_GPIO_WritePin(LED_GPIO_Port, LED_Pin, GPIO_PIN_SET);

        energymeter_plot(min, max);

        consec.start = 0;
        idx.start = -1;
      }
      break;
    }

    default:
      break;
  }

  prev = movavg_new;
}

void energymeter_plot(float min, float max) {
  ssd1306_Fill(Black);

  int32_t start = idx.start - CONTEXT_SAMPLES;
  int32_t end = idx.end + CONTEXT_SAMPLES;

  start += (start < 0 ? BUF_SIZE : 0);
  end -= (end >= BUF_SIZE ? BUF_SIZE : 0);

  int32_t total = end - start + 1;
  total += (total < 0 ? BUF_SIZE : 0);

  for (int32_t i = 0; i < total; i++) {
    int32_t pos = start + i;
    pos -= (pos >= BUF_SIZE ? BUF_SIZE : 0);

    if (buf[pos].voltage < min) {
      min = buf[pos].voltage;
    }

    if (buf[pos].voltage > max) {
      max = buf[pos].voltage;
    }
  }

  float range = max - min;
  uint32_t duration = buf[idx.end].timestamp - buf[idx.start].timestamp;

  if (range < 5.0f || duration < 200) {
    return;
  }

  for (int32_t i = 0; i < total; i++) {
    int32_t pos = start + i;

    int32_t x = i * (SSD1306_WIDTH - 1) / (total - 1);
    int32_t y = (max - buf[pos].voltage) * (SSD1306_HEIGHT - 1) / (max - min);

    if (pos == idx.start) {
      ssd1306_DrawCircle(x, y, 2, White);
    } else if (pos == idx.end) {
      ssd1306_DrawCircle(x, y, 2, White);
    } else if (pos == idx.steep) {
      ssd1306_FillCircle(x, y, 2, White);
    }
  }

  for (int32_t x = 0; x < SSD1306_WIDTH; x++) {
    int32_t offset = x * (total - 1) / (SSD1306_WIDTH - 1);
    int32_t pos = start + offset;
    pos -= (pos >= BUF_SIZE ? BUF_SIZE : 0);

    float v = buf[pos].voltage;
    int32_t y = (max - v) * (SSD1306_HEIGHT - 1) / range;

    ssd1306_DrawPixel(x, y, White);
  }

  char str[16];
  bool rising = (buf[idx.start].voltage < buf[idx.end].voltage);

  int32_t len = sprintf(str, "%.0fV", min);
  ssd1306_SetCursor(rising ? SSD1306_WIDTH - (len * 6) : 0, SSD1306_HEIGHT - 8);
  ssd1306_WriteString(str, Font_6x8, White);

  len = sprintf(str, "%.0fV", max);
  ssd1306_SetCursor(rising ? 0 : SSD1306_WIDTH - (len * 6), 0);
  ssd1306_WriteString(str, Font_6x8, White);

  len = sprintf(str, "%lums", duration);
  ssd1306_SetCursor(SSD1306_WIDTH - (len * 6), (SSD1306_HEIGHT - 8) / 2);
  ssd1306_WriteString(str, Font_6x8, White);

  if (idx.steep >= 0) {
    len = sprintf(str, "%.0fV", buf[idx.steep].voltage);
    ssd1306_SetCursor((SSD1306_WIDTH - (len * 6)) / 2, (SSD1306_HEIGHT - 16) / 2);
    ssd1306_WriteString(str, Font_6x8, White);

    len = sprintf(str, "%lums", buf[idx.steep].timestamp - buf[idx.start].timestamp);
    ssd1306_SetCursor((SSD1306_WIDTH - (len * 6)) / 2, (SSD1306_HEIGHT - 16) / 2 + 8);
    ssd1306_WriteString(str, Font_6x8, White);
  }

  ssd1306_UpdateScreen();

  for (int32_t i = 0; i < 10; i++) {
    HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);
    HAL_Delay(150);
    HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);
    HAL_Delay(150);
  }
}
