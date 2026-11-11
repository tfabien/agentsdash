# ESP32 gadget (Artillery X3 screen): working notes

Hardware, screen protocol and firmware facts for this device. The product (hub, plugin) is described in the root `CLAUDE.md`.
Language: chat in French, code comments, docs and on-screen text in English. Some older `scripts/*.py` have French docstrings: translate when touched.

## Layout of this folder

- `firmware/` - ESP32 firmware (PlatformIO), split in **core** (`model.*`, `net.*`) and **screen**
  (`display.h` interface, `display_hmi.cpp`, `layout.*`, `touch.*`, `ui_theme.h`, `hmi_uart.*`, `display_serial.cpp`). Architecture: `ARCHITECTURE.md`.
- `hmi_bridge/` - transparent USB<->screen UART bridge (used to flash the screen from the editor). `hmi_probe/` - baud/protocol probe.
- `scripts/` - `scenario.py` (5 fake sessions, 12 sub-agents -> `POST /event` v2), `mock_agents.py` (old v0.1 events), `hmi_*.py` (test scripts through the bridge).
  `ux_mockup.html` - early mockup. `tools/make_sprites.py`, `make_decor.py`, `make_font_metrics.py` - generators. `tests/` - API tests on a real gadget.
- `screen-hmi/` - the screen project: `agent-gadget.HMI`, `agent-gadget.tft` - current USART HMI project (one page, 4 fonts, 87 pictures, redesign
  2026-11-11: `../../docs/superpowers/specs/2026-11-11-screen-redesign-design.md`). `blank.HMI`, `blank.tft` - baseline without pictures.
  `f24.zi`, `f16.zi`, `s16.zi`, `s20.zi` - the fonts. Pictures come from `tools/make_decor.py` (`assets/decor/`).
  `screen-hmi/guide/` - annotated screenshots of the USART HMI editor steps. `screen-hmi/USARTHMIsetup_latest/` - editor installer (not tracked).

## Hardware (identified from photos, the .tft metadata and the TJC wiki)

- **Screen**: `TJC4827X243_011C` (TJC / Taojingchi, **X2 series**), 4.3", **480x272**, capacitive touch (CST340, I2C), MCU "AiHMI T7",
  16 MB flash, microSD slot, buzzer. Panel `PB4302-093V-07-2ZIPS-HB`, 40-pin flex `0430A029V1`.
- **4-pin connector** (silkscreen): `VCC=5V`, `TX`, `RX`, `GND`. Measure with a multimeter, do not trust wire colors.
- **ESP32**: 30-pin DevKit, USB-C, CH340, **COM3** on this PC. Wiring: `D16` (RX2) <- screen TX; `D17` (TX2) -> screen RX; `GND`; `VIN` (5 V) -> screen `VCC`.
- Past incident: the PC USB port tripped its overcurrent protection because of a **soldering iron**, not the screen.

## Screen protocol (tested)

- Commands: ASCII ending with `FF FF FF` (Nextion/TJC style). Replies: `01` ok, `03` invalid page, `1A` unknown variable/component.
- Current firmware (after flashing `agent-gadget.tft`): **9600 baud** at power-up. The gadget firmware moves it to **115200** at boot
  (runtime `baud=115200`, verified by `comok`; `GET /debug/stats` -> `link`: `switched`, `already fast` after an ESP32-only reset). `connect` -> `comok 2,1073-0,TJC4827X243_011C,...`. `bauds=115200` is accepted
  but **not applied**: stay at 9600. The first command after a baud change often returns `1A` (stray byte): send `FF FF FF` first.
- Drawing commands: `cls`, `fill`, `draw`, `cirs`, `xstr` (fonts 0 `f24`, 1 `f16`, 2 `s16` Segoe UI Semibold 16 anti-aliased,
  3 `s20` bold 20; ASCII only; 2 and 3 are proportional: widths in `firmware/font_metrics.h`), `pic x,y,id`, `picq x,y,w,h,id` (crop of a
  full-screen picture: erases a zone). Pictures: 0..15 old sprites, 16 background, 17/18 rows, 19/20 labels, 21..26 arrows,
  27..34 / 35..42 / 43..50 robots big 36x42 / small 24x28 / tiny 16x18 (roles lead, general, explore, plan, review, test, code,
  generic), 51 standby, 52..61 digits, 62 colon, 63..86 the robots with closed eyes.
- Anti-aliased fonts read best on this panel; f12 and non-anti-aliased Tahoma/Verdana were rejected on photos. Grey text needs
  RGB >= 200 to be readable; the panel washes dark colors at an angle.
- Touch: after `sendxy=1` (send at every boot) the page reports `67 xh xl yh yl st FF FF FF`, pixels, `st` 01 press / 00 release
  (`docs/touch-findings.md`). `baud=115200` (runtime) is applied until power-off.
  Nothing redraws over them because the page has no component. `bkcmd=0` silences acknowledgements.
- The original Artillery firmware (115200, ~17 pages, portrait UI) was **overwritten** by the flash.

## Screen project (USART HMI editor)

- Editor **USART HMI 1.68.2**, Chinese UI only (no language setting; do not use unofficial English patches). Official links:
  editor http://filedown.tjc1688.com/USARTHMI/USARTHMIsetup_latest.zip, factory project
  http://filedown.tjc1688.com/tjcwiki/factory_project/X2/TJC4827X243.HMI, datasheet
  http://filedown.tjc1688.com/tjcwiki/new_datasheet/TJC_X2/TJC4827X243_011C.pdf (wiki is HTTP only: http://wiki.tjc1688.com).
- Project `agent-gadget.HMI` (made from `blank.HMI`): model `TJC4827X243_011`, direction 0 (landscape), `page0` solid black (`bco`=0), fonts 0..3, ASCII.
- **Pictures and fonts without clicking**: hmi-builder (https://github.com/Ponywka/hmi-builder, MIT, pinned `f2fe864`, cloned in the
  `artillery-x3-screen-sprites` worktree under `.cache/hmi-builder`) unpacks a `.HMI` to `project.json` + PNGs and packs it back:
  replace or append pictures there, pack, then open the `.HMI` in the editor only for 文件 -> 输出生产文件. Run it with
  `python -E -X utf8 tools/hmi_project.py unpack --portable X.HMI dir` / `pack dir out.HMI --config dir/project.json`.
- **Easiest flash: the gadget's web page `http://<ip>/tft`** (user `admin`, `OTA_PASSWORD`): pick the exported `.tft`, ~1 min over Wi-Fi,
  no editor download, no bridge, no USB. Same as `curl -u admin:<pw> -F tft=@screen-hmi/agent-gadget.tft "http://<ip>/tft?size=<bytes>"`.
- The compile button does not write a file: **文件 -> 输出生产文件** exports the `.tft`. Flash it with **下载** (serial, port COM3, 115200) through
  `hmi_bridge` on the ESP32 (no SD card needed, ~49 s), or from a FAT32 microSD. A firmware-version warning is normal.
- Re-flashing a `.tft` needs `hmi_bridge` on the ESP32 again. The editor opens COM3 (resets the ESP32) and waits only ~39 ms for
  `comok` at 115200: a screen at 9600 answers too slowly ("联机失败"). `hmi_bridge` boots at 115200 on the screen side; before
  下载, put the screen at 115200 (bridge escape `7E 7E 42` + 9600 LE, `baud=115200`, escape + 115200 LE). Do not unplug in between.
  Scripts talking to a freshly powered screen (9600) through the bridge must send the escape for 9600 first (`scripts/hmi_pic_check.py` does).
- No open-source tool builds a TJC `.tft` without the official editor (checked: TFTTool, tjc-hmi-toolchain, YXerer668's toolchain automates the editor).
  Vampiro1's `LCD_Artillery_x3` repo ships a Klipper UI `.tft` for the same screen family (not used).

## Firmware (ESP32)

- **Wi-Fi without code**: first boot or unreachable Wi-Fi -> open network `AgentGadget-XXXX` with a captive-portal page (`http://192.168.4.1/config`);
  credentials are saved in flash. Config page stays at `http://<ip>/config`. Forget the Wi-Fi: hold BOOT 3 s at power-up, or `w` alone on the serial monitor.
- The gadget is reachable at **http://192.168.1.100/** (DHCP: may change; the IP is shown on the screen when no agent is displayed).
  `agent-gadget.local` (mDNS) does **not** resolve on this PC (ping fails): use the IP.
- HTTP API (details in `ARCHITECTURE.md`): `POST /event` v2 (old `{"agent","state","task"}` still accepted), `GET /state`,
  `POST /select`, `POST /reset`, `GET /update` (browser firmware upload, user `admin`), `GET /tft` (screen .tft upload, same user). `/debug/*` only in test builds (`esp32dev_test*`).
  **Never send other requests while `/tft` uploads**: the upload aborted twice and the screen needed a power cycle.
  `POST /usage`: context and plan quotas with pace, sent by the status line script or the hub.
- **USB serial input**: lines starting with `{` (`{"type":"event"|"usage","body":{...}}`) feed the same code as the HTTP handlers (`netSerialLine` in `net.cpp`).
  `r` (redraw), `t` (table) and `w` (forget Wi-Fi) act only when alone: no byte just before or after within 50 ms (a tail of a JSON line must never run `w`).
- **Updates**: USB `pio run -t upload` from `firmware/` (auto reset, no BOOT button); Wi-Fi
  `pio run -e esp32dev_ota -t upload --upload-port <ip>` (often times out: the browser `/update` page, `curl -u admin:<pw> -F firmware=@.pio/build/esp32dev_ota/firmware.bin http://<ip>/update`, worked when OTA did not); OTA/`/update` password = `OTA_PASSWORD` in `net.h` (default `agent-gadget`: **change it**).
- PlatformIO: `%USERPROFILE%\.platformio\penv\Scripts\pio.exe` (espressif32 installed). Env `esp32dev_noscreen` builds without a screen (serial backend).
- Opening COM3 resets the ESP32: wait ~2.5 s before sending. USB-side baud is fixed at 115200. The hub in serial mode owns COM3: release it (`POST /serial/release`) before flashing.
- Wi-Fi modem sleep is off (`WiFi.setSleep(false)`): with it, HTTP requests stalled up to 5.6 s.
- Screen UI (2026-11-11): title bar with the selected session, one state dot per session and a caret; **a tap opens a session menu** (rows, closes after 8 s).
  A pending `AskUserQuestion` takes the lead panel full width. Running plan steps pulse (own 100 ms timer). Bottom bar: quotas, **speaker icon = buzzer mode**
  (`all` / `ask` = needs_you only / `off`, kept in flash, `beep <ms>` command), clock.
- Drawing goes through a non-blocking queue (title bar > command strip > tree); `GET /debug/stats` (test builds) shows it.

## Pitfalls

- Flashing with output redirected to a file: set `PYTHONIOENCODING=utf-8`, or esptool crashes on its progress bar (cp1252).
- Work PC (Windows 10 Enterprise, Fortinet VPN, Dell dock); prefer a personal PC to install new tools.
- `EdtHmiStudio-0.9.1-win-x64-setup.exe` (632 MB) may sit in the repo root: origin unverified, **never run**.
- Do not reproduce the author's e-mail address found in the metadata of Vampiro1's `LCD.tft`.
- Screen text is ASCII only (no accents) unless a font with those characters is added to the project.
- Shell quoting: a `\n` inside a C string edited through a shell here-document turns into a real newline (it broke `display_serial.cpp` once). Edit C++ with an editor tool or a Python script.
