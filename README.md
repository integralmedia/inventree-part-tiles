# inventree-part-tiles

An [InvenTree](https://inventree.org) plugin that adds a large-tile gallery view panel to part categories.

![Tile View Screenshot](https://raw.githubusercontent.com/integralmedia/inventree-part-tiles/main/docs/screenshot.png)

## Features

- Extra-large part image tiles in a responsive grid
- Search and filter parts within the panel
- Sort by name, IPN, stock, or custom parameter templates
- Adjustable tile width with persistent preferences (localStorage)
- Infinite scroll with lazy image loading
- Group variant parts toggle
- Works on Part Category pages

## Requirements

- InvenTree ≥ 0.16.0
- Python ≥ 3.10

## Installation (Docker — recommended)

This method clones the repo into the InvenTree data directory, which is already bind-mounted inside the container at `/home/inventree/data`. No changes to `docker-compose.yaml` are required.

### Step 1 — Clone the repo into inventree-data

Replace `/path/to/inventree/data/inventree-data` with the host path of your `inventree-data` volume (the directory that contains `plugins.txt`, `media/`, `static/`, etc.).

```bash
git clone https://github.com/integralmedia/inventree-part-tiles.git \
    /path/to/inventree/data/inventree-data/inventree-part-tiles
```

Example for a default Docker Compose deployment under `/docker/applications/inventree`:

```bash
git clone https://github.com/integralmedia/inventree-part-tiles.git \
    /docker/applications/inventree/data/inventree-data/inventree-part-tiles
```

### Step 2 — Add the plugin to `plugins.txt`

Open `inventree-data/plugins.txt` and add the container-side path as the last line:

```
/home/inventree/data/inventree-part-tiles
```

The file should look similar to this:

```
# InvenTree Plugins (uses PIP framework to install)

inventree-dymo-plugin==1.1.1
/home/inventree/data/inventree-part-tiles
```

### Step 3 — Restart the InvenTree server

InvenTree reads `plugins.txt` on startup and runs `pip install` for each entry. Restarting the server container is sufficient — a full stack restart is not required.

```bash
docker restart inventree-server
```

### Step 4 — Enable the plugin

1. Go to **InvenTree → Settings → Plugin Settings**
2. Find **"Part Tile View"** (key: `tileview`)
3. Click **Enable**

### Step 5 — Collect static files

InvenTree copies static files only for **active** plugins, so this must run after enabling:

```bash
docker exec inventree-server invoke static
```

The **Tile View** panel will now appear on all Part Category pages.

---

## Updating

To pull in new changes from GitHub:

```bash
git -C /path/to/inventree/data/inventree-data/inventree-part-tiles pull

docker exec inventree-server pip install --upgrade /home/inventree/data/inventree-part-tiles
docker restart inventree-server
docker exec inventree-server invoke static
docker restart inventree-worker
```

---

## Usage

1. Navigate to any **Part Category** in InvenTree.
2. A **Tile View** panel will appear alongside the default panels.
3. Use the toolbar to search, sort, adjust tile size, and configure displayed fields.

## Configuration

No additional configuration is required. Preferences (tile width, displayed fields, etc.) are stored per-browser in `localStorage` under the key `inventree_tileview_prefs`.

## License

MIT
