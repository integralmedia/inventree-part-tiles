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

## Installation

### Via pip (recommended)

```bash
pip install inventree-part-tiles
```

Then enable the plugin in InvenTree → Settings → Plugin Settings.

### Manual

Clone or download this repo into your InvenTree plugins directory:

```bash
cd /path/to/inventree/plugins
git clone https://github.com/integralmedia/inventree-part-tiles.git tile_view_plugin_repo
```

Or copy the `tile_view_plugin/` folder directly into your plugins directory.

After installing, run:

```bash
python manage.py collectstatic --no-input
```

and restart InvenTree.

## Usage

1. Navigate to any **Part Category** in InvenTree.
2. A **Tile View** panel will appear alongside the default panels.
3. Use the toolbar to search, sort, adjust tile size, and configure displayed fields.

## Configuration

No additional configuration is required. Preferences (tile width, displayed fields, etc.) are stored per-browser in `localStorage` under the key `inventree_tileview_prefs`.

## License

MIT
