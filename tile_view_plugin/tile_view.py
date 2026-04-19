from plugin import InvenTreePlugin
from plugin.mixins import UserInterfaceMixin


class PartTilePlugin(UserInterfaceMixin, InvenTreePlugin):
    NAME = "LargeTileView"
    SLUG = "tileview"
    TITLE = "Part Tile View"
    AUTHOR = "Integral Media Inc."
    DESCRIPTION = "A dedicated gallery view with scalable part images and configurable display options."
    VERSION = "2.0.0"

    def get_ui_panels(self, request, context, **kwargs):
        target_model = context.get('target_model', None)

        if target_model == 'partcategory':
            return [
                {
                    'key': 'tile-view-panel',
                    'title': 'Tile View',
                    'icon': 'ti:layout-grid:outline',
                    'source': self.plugin_static_file('tile_panel.js'),
                }
            ]

        return []