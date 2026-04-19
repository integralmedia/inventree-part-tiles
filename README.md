# inventree-part-tiles

An [InvenTree](https://inventree.org) plugin that adds a large-tile gallery view panel to part categories.

![Tile View Screenshot](https://raw.githubusercontent.com/integralmedia/inventree-part-tiles/main/docs/screenshot.png)

## Requirements

- InvenTree ≥ 0.16.0
- Python ≥ 3.10

---

## Installation (Docker)

This method clones the repo into the InvenTree data directory, which is already bind-mounted inside the container at `/home/inventree/data`. No changes to `docker-compose.yaml` are required.

### Step 1 — Clone the repo into inventree-data

Replace `/path/to/inventree/data/inventree-data` with the host path of your `inventree-data` volume (the directory that contains `plugins.txt`, `media/`, `static/`, etc.).

```bash
git clone https://github.com/integralmedia/inventree-part-tiles.git \
    /path/to/inventree/data/inventree-data/inventree-part-tiles
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

## Uninstalling

### Step 1 — Disable the plugin

Go to **InvenTree → Settings → Plugin Settings**, find **"Part Tile View"**, and click **Disable**.

### Step 2 — Remove from `plugins.txt`

Delete the line `/home/inventree/data/inventree-part-tiles` from `inventree-data/plugins.txt`.

### Step 3 — Uninstall the pip package

```bash
docker exec inventree-server pip uninstall -y inventree-part-tiles
```

### Step 4 — Restart the server

```bash
docker restart inventree-server
```

### Step 5 — Remove collected static files

```bash
docker exec inventree-server rm -rf /home/inventree/data/static/plugins/tileview
```

### Step 6 — Delete the cloned repository

```bash
rm -rf /path/to/inventree/data/inventree-data/inventree-part-tiles
```

---

## Features & Usage

Navigate to any **Part Category** in InvenTree. The **Tile View** panel appears alongside the standard panels. All preferences are saved per-browser in `localStorage` and restored automatically on your next visit.

### Tile Grid

Parts are displayed as image cards in a responsive grid. Each card shows the part image (or a placeholder if none is set), and whichever fields are enabled in the **Display** panel. Clicking a card or its image navigates to the part detail page.

### Search

Type in the search box to filter parts by name, IPN, or description. Results update automatically after a short debounce delay — no need to press Enter.

### Sort

Use the sort dropdown to order parts by:

| Option | Description |
|---|---|
| Name A→Z / Z→A | Alphabetical by full part name |
| IPN A→Z / Z→A | Alphabetical by Internal Part Number |
| Stock ↓ / ↑ | Highest or lowest stock quantity first |
| Newest / Oldest | By creation date |

### Filters

Click **Filters** to open the filter panel. Each filter pill cycles through three states:

- **Off** (default) — no filter applied
- **Blue (Yes)** — only show parts where this is true
- **Red (No)** — only show parts where this is false

Available filters: **Active**, **Assembly**, **Component**, **Purchaseable**, **Salable**, **Trackable**, **Virtual**, **Has Stock**, **Templates only**.

Multiple filters can be active simultaneously. Filters combine with any active search.

### Display Options

Click **Display** to choose which fields appear on each tile:

| Field | Description |
|---|---|
| Name | Full part name (always recommended) |
| IPN | Internal Part Number |
| Description | Part description text |
| Stock | Current stock quantity. Shows total rollup stock for template parts |
| Category | The part category name |
| Revision | Part revision identifier |
| Active badge | Shows an Active or Inactive badge on each tile |

Changes take effect instantly without reloading data.

### Tile Size

The **Size** slider in the toolbar adjusts tile width from 120 px to 340 px. The grid reflows automatically. Your preferred size is saved and restored on your next visit.

### Hover Popover

Hovering over a tile for ~320 ms shows a popover with additional detail:

- Full part name, IPN, and description
- Category
- Stock quantity (with units if set)
- Default stock location
- Live breakdown of stock quantities by location (fetched on demand and cached)

Move the mouse onto the popover itself to keep it visible while you read it.

### Group Variants

Enable **Group variants** in the **Display** panel to collapse template parts and their variants into a single tile. The template card shows a stacked-layers overlay icon, and its variants are listed below the image with their individual stock quantities. Variants that belong to a template not present in the current category are shown as standalone tiles.

This mode performs a single bulk fetch of all parts in the category rather than paginated fetches, and sorts them client-side according to the selected sort order.

### Custom Parameter Columns

The **Display** panel dynamically loads all parameter templates defined in your InvenTree instance. Each appears as a toggleable pill under the **Parameters** section. Enabling a parameter fetches its values for all loaded parts and displays them on each tile. Multiple parameters can be shown simultaneously.

Parameter values are fetched once and cached for the session — switching a parameter off and back on does not re-fetch.

### Infinite Scroll

In normal (non-grouped) mode, parts load 48 at a time. As you scroll toward the bottom, the next page is fetched automatically. A status bar above the grid shows how many parts are currently visible out of the total matching the current search and filters.

---

## License

MIT
