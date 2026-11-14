# ESPFlash

**Flash ESP32 / ESP8266 firmware directly from your browser.**

ESPFlash is a lightweight, static web tool powered by [esptool-js](https://github.com/espressif/esptool-js).  
It runs entirely client-side via the Web Serial API – no installation, no server upload of your firmware.

## Features

- Multi-file `.bin` selection with individual flash addresses
- Common ESP32 layout pre-filled (bootloader / partition table / app)
- Configurable baud rate, flash mode, frequency and size
- Optional full-chip erase before writing
- Live log console
- Automatic chip detection
- Clean “browser not supported” screen when Web Serial is missing
- Lightning-bolt logo, dark modern UI
- Ready for GitHub Pages (pure static files)

## Browser support

Requires the **Web Serial API**:

- Google Chrome 89+
- Microsoft Edge 89+
- Opera 76+

Safari, Firefox and most mobile browsers are **not** supported.

## Deploy on GitHub Pages

1. Create a new repository (e.g. `espflash`).
2. Upload the contents of this folder to the repository root (or a `docs/` folder).
3. In the repository **Settings → Pages**, set the source to the branch and folder that contain `index.html`.
4. After a short wait your tool will be live at  
   `https://<username>.github.io/<repo>/`

Because the site is fully static and loads esptool-js from a CDN, no build step is required.

## Local testing

Any static file server works:

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080` in Chrome or Edge.

## Usage

1. Connect your ESP board via USB.
2. Click **Connect** and select the serial port.
3. Add or replace the `.bin` files and set the correct flash addresses.
4. (Optional) Adjust flash mode / frequency / size or enable “Erase flash”.
5. Click **Program** and watch the log console.

Typical addresses for a standard ESP-IDF / Arduino-ESP32 build:

| File              | Address  |
|-------------------|----------|
| bootloader.bin    | `0x1000` |
| partition-table.bin | `0x8000` |
| application.bin   | `0x10000` |

A single merged firmware image is usually written to `0x0`.

## Credits

Flashing engine: [esptool-js](https://github.com/espressif/esptool-js) by Espressif Systems (Apache-2.0).

## License

MIT
