from PyQt6.QtCore import QObject, Signal

class InfiniteScroll(QObject):
    """
    Classe indépendante pour gérer le scroll infini.
    Se branche sur un QScrollBar (ou un widget avec scrollbar) et déclenche
    un signal load_more quand on approche de la fin.
    """

    load_more = Signal()

    def __init__(self, scrollbar, threshold=50):
        """
        scrollbar : QScrollBar (verticale normalement)
        threshold : int, distance en pixels avant la fin pour déclencher load_more
        """
        super().__init__()
        self.scrollbar = scrollbar
        self.threshold = threshold
        self._connected = False
        self._connect_scrollbar()

    def _connect_scrollbar(self):
        if not self._connected:
            self.scrollbar.valueChanged.connect(self._on_scroll)
            self._connected = True

    def _on_scroll(self, value):
        # Valeur max du scroll
        max_value = self.scrollbar.maximum()
        # Si on est proche de la fin (threshold pixels ou moins)
        if max_value - value <= self.threshold:
            self.load_more.emit()
