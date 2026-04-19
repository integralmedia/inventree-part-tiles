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

### Step 3 — Restart InvenTree

InvenTree reads `plugins.txt` on startup and runs `pip install` for each entry. Restarting the stack will install the plugin package into the container.

```bash
cd /path/to/inventree
docker compose down && docker compose up -d
```

### Step 4 — Collect static files

After the containers are running, collect static assets so the panel JavaScript is served correctly:

```bash
docker exec inventree-server invoke static
```

### Step 5 — Enable the plugin

1. Go to **InvenTree → Settings → Plugin Settings**
2. Find **"Part Tile View"** (key: `tileview`)
3. Click **Enable**

The **Tile View** panel will now appear on all Part Category pages.

---

## Updating

To pull in new changes from GitHub:

```bash
git -C /path/to/inventree/data/inventree-data/inventree-part-tiles pull

docker exec inventree-server pip install --upgrade /home/inventree/data/inventree-part-tiles
docker exec inventree-server invoke static
docker restart inventree-worker
```

No full stack restart is needed unless the Python plugin code itself changed (not just the JS/templates). If the plugin stops loading after an update, do a full restart:

```bash
cd /path/to/inventree && docker compose down && docker compose up -d
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
