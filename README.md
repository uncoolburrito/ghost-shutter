# GhostShutter

A privacy-focused, local-first web application designed to remove AI provenance markers (C2PA / Content Credentials) and compose an authentic, camera-accurate metadata profile corresponding to a physical **Canon EOS 70D DSLR** camera edited and exported from **Adobe Photoshop 26.3 (Windows)**.

---

## Highlights & Capabilities

* **C2PA / Content Credentials Removal**: Detects and cleanly strips C2PA manifests (provenance data attached by AI editing and color-grading tools) without injecting any replacement credentials.
* **Authentic Canon EOS 70D Profile**: Injects ~278 genuine Canon MakerNote tags, internal body serial number (`FA0631074`), internal temperature sensor readings (`31 °C`), AF point structures, sensor calibration matrices, and lens type definitions (Canon EF-S 55-250mm f/4-5.6 IS II).
* **Photoshop 26.3 Format Conversion Lineage**: Writes an authentic 3-stage Adobe Photoshop XMP history record:
  1. `saved` as `image/jpeg`
  2. `converted` with parameters `from image/jpeg to image/png`
  3. `saved` as `image/png`
* **Color Space Fidelity**: Injects the genuine Hewlett-Packard `sRGB IEC61966-2.1` ICC profile directly into the standard PNG `iCCP` chunk.
* **Lossless PNG Output**: Converts and preserves pristine pixel integrity (`compressionLevel: 9`) with zero re-compression degradation.
* **Multi-Image Batch Processing**:
  * Drag-and-drop 6–7+ photos simultaneously.
  * Professional single-frame shoot timing with organic jitter (±2–4s variance per shot) to prevent robotic, identical capture timestamps.
  * Continuous Canon DSLR sequence numbering (`IMG_XXXX.png` with persistent memory across sessions).
  * Non-throttled sequential downloads (no ZIP extraction required).
* **Privacy & Security**:
  * 100% offline local processing — no external API calls, tracking, or cloud uploads.
  * Ephemeral processing directories automatically purged immediately after job completion.
  * Strips GPS coordinates by default; never fabricates location data.

---

## Prerequisites

Before running the application, ensure the following system tools are installed on your machine:

1. **Node.js**: Version **20.x** or **22.x** LTS ([Download Node.js](https://nodejs.org/))
2. **ExifTool**: The underlying command-line utility used for lossless low-level EXIF, MakerNote, and XMP read/write operations.

---

## Installation & Setup

### Step 1: Install System Dependencies (ExifTool)

ExifTool must be accessible in your system's `PATH`. Install it using your operating system's package manager:

#### macOS
Using [Homebrew](https://brew.sh/):
```bash
brew install exiftool
```

#### Ubuntu / Debian Linux
```bash
sudo apt update
sudo apt install -y libimage-exiftool-perl
```

#### Fedora / RHEL
```bash
sudo dnf install perl-Image-ExifTool
```

#### Arch Linux
```bash
sudo pacman -S perl-image-exiftool
```

#### Windows
You can install ExifTool on Windows using any of the following methods:
* **Via Winget**:
  ```powershell
  winget install OliverBetz.ExifTool
  ```
* **Via Chocolatey**:
  ```powershell
  choco install exiftool
  ```
* **Manual Install**:
  1. Download the Windows Executable from [exiftool.org](https://exiftool.org/).
  2. Extract `exiftool(-k).exe` and rename it to `exiftool.exe`.
  3. Move `exiftool.exe` to a folder in your system `PATH` (such as `C:\Windows\` or `C:\Program Files\ExifTool\`).
* **Via WSL2 (Windows Subsystem for Linux)**:
  ```bash
  sudo apt update && sudo apt install -y libimage-exiftool-perl
  ```

Verify the installation in your terminal:
```bash
exiftool -ver
```
*(Should output a version number, e.g. `12.xx` or `13.xx`)*

---

### Step 2: Clone the Repository

```bash
git clone https://github.com/uncoolburrito/ghost-shutter.git
cd ghost-shutter
```

---

### Step 3: Install Node.js Dependencies

```bash
npm install
```

---

### Step 4: Run the Test Suite (Recommended)

Verify that your local environment, Sharp image processing, and ExifTool binaries pass all 31 automated unit and integration tests:

```bash
npm test
```

Expected output:
```
 ✓ tests/batch-timing.test.ts (5 tests)
 ✓ tests/metadata-builder.test.ts (6 tests)
 ✓ tests/photoshop-profile.test.ts (1 test)
 ✓ tests/golden-camera.test.ts (1 test)
 ✓ tests/image-processing.test.ts (10 tests)
 ✓ tests/c2pa-handling.test.ts (8 tests)

 Test Files  6 passed (6)
      Tests  31 passed (31)
```

---

### Step 5: Start the Development Server

```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## Production Deployment

### Option A: Local Production Build

To run an optimized production build locally:

```bash
# Build the Next.js production bundle
npm run build

# Start the production server
npm start
```

By default, the server listens on port `3000`. To customize the port:
```bash
PORT=8080 npm start
```

---

### Option B: Docker Deployment (Containerized)

If you have [Docker](https://www.docker.com/) installed, you can run the entire application containerized without needing to install ExifTool or Node.js directly on your host machine:

```bash
# Build and start the container in the background
docker compose up --build -d
```

Access the app at `http://localhost:3000`.

To stop the container:
```bash
docker compose down
```

---

## Configuration Architecture

All hardware configurations, lens profiles, and application parameters are kept in modular JSON files under `/config/`:

| Configuration File | Purpose |
| :--- | :--- |
| `config/camera-profile.json` | Physical camera body & lens profile (Make: Canon, Model: EOS 70D, Lens: EF-S 55-250mm, serials, firmware). |
| `config/capture-profiles.json` | Shooting presets (Default 70D, Outdoor Daylight, Low Light / High ISO, Portrait). |
| `config/application-config.json` | Default timezone (`Asia/Kolkata`), upload limits, ephemeral directory paths. |
| `config/templates/` | Authentic Canon EOS 70D binary reference template and `sRGB_IEC61966-2-1.icc` color profile. |

---

## Verification Scripts

The repository includes standalone end-to-end verification scripts that test against a running Next.js instance:

```bash
# Verify Photoshop 26.3 XMP lineage, MakerNotes, and PNG profile
npx tsx tests/verify-photoshop-profile-api.ts

# Verify batch processing of 7 images with sequential timing and Canon numbering
npx tsx tests/verify-batch-api.ts

# Verify end-to-end C2PA detection and removal
npx tsx tests/verify-e2e-api.ts
```

---

## Project Directory Structure

```
├── app/                        # Next.js App Router
│   ├── api/inspect/            # Metadata and C2PA detection API
│   ├── api/process/            # Metadata composition & C2PA stripping API
│   ├── layout.tsx              # Root HTML and metadata layout
│   └── page.tsx                # Main single/batch user interface
├── components/                 # React UI Components
│   ├── DownloadResult.tsx      # Download cards, inline renamer, diff viewer
│   ├── ImageDropzone.tsx       # Drag-and-drop batch file queue
│   ├── MetadataPreview.tsx     # Pre-processing metadata inspector
│   ├── ProcessingOptions.tsx   # Capture date/time, shoot timing, file naming
│   └── ProcessingStatus.tsx    # Real-time progress and verification status
├── config/                     # Configuration files & binary templates
│   ├── camera-profile.json     # Canon 70D hardware definitions
│   ├── capture-profiles.json   # Exposure & sensor presets
│   └── templates/              # 70D MakerNote template & sRGB ICC profile
├── lib/                        # Core utility modules
│   ├── batch-timing.ts         # Single-frame shooting intervals & organic jitter
│   ├── c2pa-handler.ts         # C2PA detection & manifest stripping
│   ├── exiftool-runner.ts      # Low-level ExifTool CLI wrapper
│   ├── file-naming.ts          # Canon DSLR frame numbering & Photoshop export
│   ├── metadata-builder.ts     # 278-tag MakerNote & Photoshop XMP builder
│   └── metadata-validator.ts   # Post-write EXIF & PNG integrity validator
└── tests/                      # Vitest unit & end-to-end test suites
```

---

## Troubleshooting

* **`exiftool: command not found`**:
  Ensure ExifTool is installed and present in your system PATH (`which exiftool` on Linux/macOS, `where exiftool` on Windows).
* **Port 3000 already in use**:
  Next.js will automatically try the next available port (e.g. `http://localhost:3001`), or you can run `PORT=3005 npm run dev`.
* **Sharp compilation / installation issues on Linux**:
  Sharp bundles pre-compiled libvips binaries for most architectures. If you encounter issues on minimal Linux distributions, install `vips-dev` (`sudo apt install -y libvips-dev` or `apk add vips-dev`).

---

## License

Private / Personal Utility.
