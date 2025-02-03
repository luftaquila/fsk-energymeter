# Formula Student Korea Electric Energy Meter

![](.github/assets/3d.png)

## 0. Features

* Records the following values:
    * HV bus voltage 
    * HV bus current
    * LV supply voltage 
    * Ambient (CPU) temperature
    * Real-world time of each records
* 100 Hz data sampling rate
* Mounted as a USB Mass Storage device
* Data visualizer available on most platforms

## 1. Specifications

| | MIN | TYP | MAX | UNIT |
|:-:|:-:|:-:|:-:|:-:|
| Supply voltage<sup>1</sup> | 6 | | 28 | V |
| Power consumption | | 0.25 | 0.5 | W |
| HV bus voltage | 0 | | 600 | V |
| HV bus voltage resolution | | 0.24 | | V |
| HV bus current | -750 | | 750 | A |
| HV bus current resolution | | 0.64 | | A |
| Operational temperature | -10 | | 80 | °C |
| IP rating | | IP 20 | | |
| Startup time |  | 570 | 700 | ms |
| Record interval |  | 10 | 15 | ms |
| Possible data loss<br>on power brownout | 0 | | 100 | ms |

<sup>1</sup> When powered by USB, the device can startup with a minimum supply voltage of 4.5 V.

## 2. Connectors

| | LV | HV |
|:-:|:-:|:-:|
| Model | [T4145415051-001](https://www.te.com/en/product-T4145415051-001.html) | [39291028](https://www.molex.com/en-us/products/part-detail/39291028) |
| Image | <img src=".github/assets/lv.png" width="300"> | <img src=".github/assets/hv.png" width="300"> |
| Mate | [T4113402051-000](https://www.te.com/en/product-T4113402051-000.html)<sup>1</sup> | [5557-02](https://www.molex.com/en-us/part-list/5557?physical_circuitsMaximum=%222%22&physical_numberOfRows=%222%22) and [5556T](https://www.molex.com/en-us/products/part-detail/39000038) |
| Pinout | 1: `D-`<br>2: `D+`<br>3: `N/C`<br>4: `VIN`<br>5: `GND` | 1: `HV+`<br>2: `HV-` |

<sup>1</sup> [T4111402051-000](https://www.te.com/en/product-T4111402051-000.html) is also mountable, but it is ***highly recommended*** to use the angled model `T4113402051-000`.

### Wiring

![](.github/assets/wire.png)

> [!CAUTION]
> Misconnection of the pins may cause permanent damage to the device.

> [!NOTE]
> The _data cable_ and the _drive cable_ are two distinct cables. When driving the vehicle, connect the _drive cable_ to the LV connector of the FSK-EEM device.
> When extracting the data, disconnect the _drive cable_ and connect the _data cable_ instead.

> [!TIP]
> The easiest way to make a data cable is to cut any USB cable with a USB Type-A connector on one end.

## 3. Usage

### 3-1. Record data

When driving the vehicle, connect both _HV cable_ and _drive cable_ to the FSK-EEM device.

The _drive cable_ should supply `VIN >= 6V` to the device to start as a record mode.

> [!IMPORTANT]
> The device performs a zero calibration of the HV voltage and current during the startup sequence (~700ms).
> Make sure that the HV voltage and current are at 0V and 0A until the the startup is complete.

When the zero calibration is finished, the device will continuously measure the HV voltage, HV current, LV voltage and the CPU temperature every 10 ms.

A new log file will be created for every power cycles.

> [!NOTE]
> The logged data will be synchronized to the file every 100 ms. During the file write, measurement may delayed up to 5 ms.

> [!NOTE]
> The device uses its internal clock to record the actual time of the measured data.
> As the clock accumulate errors over time, you should synchronize the time with FSK-EEM Viewer if you're using it after a long period.
> If the time kept resetted to `May 12, 1999`, it means that the battery should be replaced.

### 3-2. Extract data

To extract the recorded data from the device, disconnect _drive cable_ from the device and connect _data cable_ instead. There is no need to disconnect the _HV cable_ during data extraction.

Plug the USB side of the _data cable_ to the PC. The FSK-EEM USB Mass Storage will appear soon ([max ~20s](https://github.com/luftaquila/fsk-energymeter?tab=readme-ov-file#6-troubleshootings)).

The recorded log files are stored in the drive like a common USB memory stick. Copy the log files to your PC.

> [!IMPORTANT]
> The timestamp part at the beginning of the log file's name is important to calculate the actual timestamp.
> Do ***NOT*** edit the filename of the *.log file. JSON or CSV files are not affected.

> [!NOTE]
> The drive is ***read-only***. You cannot edit or delete the log files in the file explorer.

> [!TIP]
> To read log files with your smartphone, use an additional USB Type-A to Type-C adapter with the _data cable_.

### 3-3. View data

Go to the [online viewer](https://fsk-energymeter.luftaquila.io) and open the log file to view the recorded data as a graph, or export the log as a human-readable JSON/CSV format.

> [!NOTE]
> If there is no Internet connection, download html or executable of the FSK-EEM Viewer from the [latest release](https://github.com/luftaquila/fsk-energymeter/releases/latest) in advance.

### 3-4. Configure the device

In the FSK-EEM Viewer's Device Configuration section, click the `Connect` button and select the FSK-EEM device to connect.

The device's UID and the current time will be displayed on successful connection.

* `Sync RTC` button synchronizes the device clock with the host computer.
* `Delete` button deletes **ALL** files stored in the device. This button will be active only if the `Unlock` button is clicked.

Unplug and re-connect the device to see the change after the delete.

> [!WARNING]
> The delete action cannot be undone.

## 4. DIY

### 4.1 Build hardware

1. Download `fsk-energymeter-pcb.zip` from the [latest release](https://github.com/luftaquila/fsk-energymeter/releases/latest) and extract it.
2. Place a JLCPCB PCBA(SMT) order using the GERBER, BOM and CPL files at the The *gerbers/* directory.
3. Solder following parts manually to the device after the PCB arrives.
    * [L01Z600S05](https://www.eleparts.co.kr/goods/view?no=261774) Hall sensor
    * [39291028](https://www.eleparts.co.kr/goods/view?no=1058873) HV connector
    * [T4145415051-001](https://www.eleparts.co.kr/goods/view?no=7504808) LV connector
    * [2.54mm 2\*4 debug pin header](https://www.eleparts.co.kr/goods/view?no=12534585)

### 4.2 Upload firmware

1. Download `fsk-energymeter-firmware.zip` [latest release](https://github.com/luftaquila/fsk-energymeter/releases/latest) and extract it.
1. Connect ST-Link's `3V3`, `GND`, `SWCLK`, `SWDIO` pins to the same pins at the FSK-EEM's debug pin header.
1. Run `flash.bat` to flash the release firmware to the device.

### 4.3 3d-print housing

1. Download `fsk-energymeter-3d.zip` from the [latest release](https://github.com/luftaquila/fsk-energymeter/releases/latest) and extract it.
2. 3d-print both `top.stl` and `bottom.stl` files.

### 4.4 Final assembly

**TODO**

## 5. Development

> [!NOTE]
> This section is for developers who want to modify the firmware or the viewer on their own, and is NOT REQUIRED in general.

### 5-1. Firmware

<details>
<summary>click to expand</summary>

#### Prerequisites

1. Clone repository
    ```sh
    git clone https://github.com/luftaquila/fsk-energymeter.git --recursive
    ```

2. Make sure the `arm-none-eabi-gcc`, `openocd` and `make` executables are in the `$PATH`.
    * Common
        * [Arm GNU Toolchain (**AArch32 bare-metal target (arm-none-eabi)**)](https://developer.arm.com/downloads/-/arm-gnu-toolchain-downloads)
    * Windows
        * [OpenOCD for Windows](https://gnutoolchains.com/arm-eabi/openocd/)
        * [Make for Windows](https://gnuwin32.sourceforge.net/packages/make.htm)
    * macOS
        ```sh
        brew install make openocd
        ```
    * Linux
        ```sh
        sudo apt-get install build-essential openocd
        ```

#### Build and upload

```sh
cd fsk-energymeter/device/firmware
make program  # release build
make debug    # debug build
```

</details>

### 5-2. Viewer

<details>
<summary>click to expand</summary>

#### Prerequisites

1. [Node.js](https://nodejs.org/en/download/package-manager) >= v20
2. [Rust](https://www.rust-lang.org/tools/install) >= 1.81.0
3. Clone the repository and install dependencies
    ```sh
    git clone https://github.com/luftaquila/fsk-energymeter.git --recursive
    cd fsk-energymeter/viewer/web
    npm install
    cd ../native
    npm install
    ```

#### Build and run

* Web
    ```sh 
    cd fsk-energymeter/viewer/web
    python -m http.server 80  # open http://localhost
    ```

* Native
    ```sh
    cd fsk-energymeter/viewer/native
    npm run tauri dev    # run
    npm run tauri build  # build executables
    ```

</details>

## 6. Troubleshootings

#### 1. FSK-EEM USB Mass Storage takes too long to be mounted on the host
The FSK-EEM uses the STM32F401, which implements a USB Full Speed PHY. It is decades-old technology with a maximum transfer speed of 12 Mbit/s. However, in the real world, the actual speed is around 4 Mbit/s or 0.5 MB/s.

When you plug the FSK-EEM device, the host(PC) will try to load the FAT table of the SDMMC into its memory. The size of the FAT32 FAT table is around 8 MB, so it took ~20 seconds for the FSK-EEM to be successfully mounted on the host computer. This is a hardware limitation in exchange of the lower cost.

The RTC sync or record delete functions will work immediately regardless of this limit.

#### 2. `Web Serial API not supported` error on the FSK-EEM Viewer.

FSK-EEM Viewer's Device Configuration tab uses the Web Serial API to talk with the device, which has [limited support](https://caniuse.com/?search=Web%20Serial%20API) across the platforms and browsers.

On macOS, the native app uses the Safari for its WebView, which does not supports the API. The web version(URL or html file) of the FSK-EEM Viewer will work on the Chrome browser.

On Android and iOS, the API is not supported from the OS layer. Use the desktop version of the viewer to configure the device.

## 7. LICENSE

```
"THE BEERWARE LICENSE" (Revision 42):
LUFT-AQUILA wrote this project. As long as you retain this notice,
you can do whatever you want with this stuff. If we meet someday,
and you think this stuff is worth it, you can buy me a beer in return.
```

이 저장소의 모든 내용물은 얼마든지 자유롭게 사용할 수 있습니다.\
이 프로젝트가 마음에 든다면, 언젠가 우리가 만나게 되었을 때 맥주 한 잔 사 주세요.
