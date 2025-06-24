include <BOSL2/std.scad>

FLICKER_MARGIN = 0.01;

function FLK(x) = x + FLICKER_MARGIN;

X = 0;
Y = 1;
Z = 2;
OUTER = [106, 84.2, 17.65];

module body() {
  diff() {
    translate([-OUTER[X]/2, -OUTER[Y]/2, -OUTER[Z]/2])
    cube(OUTER) {
      // outer top chamfer
      tag("remove") edge_mask(TOP) chamfer_edge_mask(chamfer=2);

      // inner level 1
      IN1 = [102.5, 80.7, 3];
      IN1_OFF = [-(IN1[X] / 2), -(IN1[Y] / 2), -(OUTER[Z] / 2 + FLICKER_MARGIN)];
      tag("remove") translate(IN1_OFF) cube(IN1);

      // inner level 2
      IN2 = [96, 40.2, 11.65];
      IN2_OFF = [-(IN2[X] / 2), 13 - (IN2[Y] / 2), IN1[Z] + IN1_OFF[Z] - FLICKER_MARGIN];
      tag("remove") translate(IN2_OFF) {
        union() {
          cube(IN2);

          IN2_SEG1 = [19, 23, IN2[Z]];
          IN2_SEG1_OFF = [0, -IN2_SEG1[Y] + FLICKER_MARGIN, 0];
          tag("remove") translate(IN2_SEG1_OFF) cube(IN2_SEG1);

          IN2_SEG2 = [4, 7, IN2[Z]];
          IN2_SEG2_OFF = [IN2_SEG1[X] - IN2_SEG2[X], IN2_SEG1_OFF[Y] - IN2_SEG2[Y] + FLICKER_MARGIN, 0];
          tag("remove") translate(IN2_SEG2_OFF) cube(IN2_SEG2);

          IN2_SEG3 = [36, 30, IN2[Z]];
          IN2_SEG3_OFF = [22 + IN2_SEG1[X], -IN2_SEG3[Y] + FLICKER_MARGIN, 0];
          tag("remove") translate(IN2_SEG3_OFF) cube(IN2_SEG3);
        }
      }
    }
  }
}

body();
