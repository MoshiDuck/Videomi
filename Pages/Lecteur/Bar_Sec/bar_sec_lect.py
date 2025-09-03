# bar_sec_lect.py
from PyQt6.QtCore import QSize, pyqtSignal, QPoint, QTimer
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QFrame, QHBoxLayout, QVBoxLayout, QLabel, QSizePolicy, QWidget, QListWidget, \
    QListWidgetItem, QApplication

from Core.logger_config import logger
from Pages.Lecteur.chapter_slider import ChapterSlider
from Pages.Navigateur.Widgets.flexible_container import FlexibleContainer
from Widgets.icon_perso import IconPerso
from Widgets.volume_control_lect import VolumeControlLect
from Core.Language.i18n import get_text  # Import du système de traduction

class BarLangueSub(QFrame):
    audio_selected = pyqtSignal(object)
    subtitle_selected = pyqtSignal(object)
    subtitle2_selected = pyqtSignal(object)

    def __init__(self):
        super().__init__()
        self.bar_sec_lect = None
        self.collapsed_height = 40
        self.max_expanded_height = 300
        self.item_height = 24

        self.setFixedHeight(self.collapsed_height)
        self.setStyleSheet("background: transparent;")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint |
                            Qt.WindowType.Tool |
                            Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        # Conteneur flexible
        container = FlexibleContainer(self, ratios=[1, 2, 2, 2], dividers=True)
        container.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(container)

        pan1 = getattr(container, "pan1")
        pan1_layout = QVBoxLayout(pan1)
        pan1_layout.setContentsMargins(6, 2, 6, 2)
        pan1_layout.setSpacing(0)
        pan1_layout.addWidget(QLabel(get_text("lecteur_labels.speed"), self, alignment=Qt.AlignmentFlag.AlignCenter))

        pan2 = getattr(container, "pan2")
        pan2_layout = QVBoxLayout(pan2)
        pan2_layout.setContentsMargins(4, 2, 4, 2)
        pan2_layout.setSpacing(4)
        lbl_audio = QLabel(get_text("lecteur_labels.audio"), self, alignment=Qt.AlignmentFlag.AlignCenter)
        lbl_audio.setFixedHeight(18)
        pan2_layout.addWidget(lbl_audio)
        self.audio_list = QListWidget(pan2)
        self.audio_list.setVerticalScrollMode(QListWidget.ScrollMode.ScrollPerPixel)
        self.audio_list.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.audio_list.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        pan2_layout.addWidget(self.audio_list)
        self.audio_list.itemClicked.connect(self._on_audio_item_clicked)

        pan3 = getattr(container, "pan3")
        pan3_layout = QVBoxLayout(pan3)
        pan3_layout.setContentsMargins(4, 2, 4, 2)
        pan3_layout.setSpacing(4)
        lbl_sub = QLabel(get_text("lecteur_labels.subtitles"), self, alignment=Qt.AlignmentFlag.AlignCenter)
        lbl_sub.setFixedHeight(18)

        pan3_layout.addWidget(lbl_sub)
        self.subtitle_list = QListWidget(pan3)
        self.subtitle_list.setSelectionMode(QListWidget.SelectionMode.MultiSelection)
        self.subtitle_list.setVerticalScrollMode(QListWidget.ScrollMode.ScrollPerPixel)
        self.subtitle_list.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.subtitle_list.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        pan3_layout.addWidget(self.subtitle_list)
        self.subtitle_list.itemSelectionChanged.connect(self._on_subtitle_selection_changed)

        pan4 = getattr(container, "pan4")
        pan4_layout = QVBoxLayout(pan4)
        pan4_layout.setContentsMargins(0, 0, 0, 0)
        pan4_layout.setSpacing(0)
        pan4_layout.addWidget(QLabel(get_text("lecteur_labels.video_tracks"), self, alignment=Qt.AlignmentFlag.AlignCenter))

    def _on_subtitle_selection_changed(self):
        try:
            selected_items = self.subtitle_list.selectedItems()
            # Réinitialiser
            self.subtitle_selected.emit(-1)
            self.subtitle2_selected.emit(-1)

            if not selected_items:
                return

            # Premier choix = sid principal
            if len(selected_items) >= 1:
                sid1 = selected_items[0].data(Qt.ItemDataRole.UserRole)
                self.subtitle_selected.emit(sid1)

            # Deuxième choix = secondary-sid
            if len(selected_items) >= 2:
                sid2 = selected_items[1].data(Qt.ItemDataRole.UserRole)
                self.subtitle2_selected.emit(sid2)

        except Exception as e:
            print(f"_on_subtitle_selection_changed erreur: {e}")

    # ---------------- position & géométrie ----------------

    def update_geometry(self, parent_widget: QWidget = None):
        try:
            if not parent_widget:
                parent_widget = self.bar_sec_lect or QApplication.activeWindow()

            if parent_widget and hasattr(parent_widget, 'slider'):
                slider = parent_widget.slider
                global_pos = slider.mapToGlobal(QPoint(0, 0))
                self.setFixedWidth(slider.width())
                self.move(
                    global_pos.x(),
                    global_pos.y() - self.height()
                )
        except Exception as e:
            logger.error(f"Update geometry error: {e}")

    def link_with_bar(self, bar_sec_lect):
        self.bar_sec_lect = bar_sec_lect
        try:
            bar_sec_lect.installEventFilter(self)
        except Exception:
            pass

    def eventFilter(self, obj, event):
        if obj is self.bar_sec_lect:
            if event.type() == event.Type.Hide:
                self.hide()
        return super().eventFilter(obj, event)

    # ---------------- UI population / interaction ----------------
    @staticmethod
    def _format_track_label(t: dict) -> str:
        try:
            lang = t.get("lang") or t.get("language") or ""
            title = t.get("title") or t.get("label") or t.get("name") or ""
            if title:
                return f"{title} ({lang})" if lang else title
            if lang:
                return f"{lang} [{t.get('id', '?')}]"
            return f"track {t.get('id', '?')}"
        except Exception:
            return str(t)

    def _recompute_and_apply_height(self):
        try:
            header_h = 10
            audio_count = self.audio_list.count()
            sub_count = self.subtitle_list.count()
            max_visible_items = 6
            visible_items = min(max_visible_items, max(audio_count, sub_count))
            lists_h = visible_items * self.item_height
            desired = header_h + lists_h + 28
            desired = min(self.max_expanded_height, max(self.collapsed_height, desired))
            if self.isVisible():
                self.setFixedHeight(int(desired))
        except Exception as e:
            print(f"_recompute_and_apply_height erreur: {e}")

    def set_audio_tracks(self, tracks: list):
        try:
            self.audio_list.clear()
            if not tracks:
                it = QListWidgetItem(get_text("lecteur_labels.no_audio_detected"))
                it.setData(Qt.ItemDataRole.UserRole, None)
                self.audio_list.addItem(it)
            else:
                for t in tracks:
                    td = t if isinstance(t, dict) else {"id": t[0], "title": t[1]} if isinstance(t, (list, tuple)) else {"id": t, "title": str(t)}
                    label = self._format_track_label(td)
                    item = QListWidgetItem(label)
                    item.setData(Qt.ItemDataRole.UserRole, td.get("id"))
                    selected = bool(int(td.get("selected", 0))) if td.get("selected") is not None else bool(td.get("default", False))
                    if selected:
                        self.audio_list.setCurrentItem(item)
                    self.audio_list.addItem(item)
            QTimer.singleShot(0, self._recompute_and_apply_height)
            QTimer.singleShot(0, lambda: self.update_geometry(self.window()))
        except Exception as e:
            print(f"set_audio_tracks erreur: {e}")

    def set_subtitle_tracks(self, tracks: list):
        try:
            self.subtitle_list.clear()
            off_item = QListWidgetItem(get_text("lecteur_labels.disable_subtitles"))
            off_item.setData(Qt.ItemDataRole.UserRole, -1)
            self.subtitle_list.addItem(off_item)
            if tracks:
                for t in tracks:
                    td = t if isinstance(t, dict) else {"id": t[0], "title": t[1]} if isinstance(t, (list, tuple)) else {"id": t, "title": str(t)}
                    label = self._format_track_label(td)
                    item = QListWidgetItem(label)
                    item.setData(Qt.ItemDataRole.UserRole, td.get("id"))
                    selected = bool(int(td.get("selected", 0))) if td.get("selected") is not None else bool(td.get("default", False))
                    if selected:
                        self.subtitle_list.setCurrentItem(item)
                    self.subtitle_list.addItem(item)
            QTimer.singleShot(0, self._recompute_and_apply_height)
            QTimer.singleShot(0, lambda: self.update_geometry(self.window()))
        except Exception as e:
            print(f"set_subtitle_tracks erreur: {e}")

    def _on_audio_item_clicked(self, item: QListWidgetItem):
        try:
            aid = item.data(Qt.ItemDataRole.UserRole)
            self.audio_selected.emit(aid)
        except Exception as e:
            print(f"_on_audio_item_clicked erreur: {e}")

    def _on_subtitle_item_clicked(self, item: QListWidgetItem):
        try:
            sid = item.data(Qt.ItemDataRole.UserRole)
            self.subtitle_selected.emit(sid)
        except Exception as e:
            print(f"_on_subtitle_item_clicked erreur: {e}")

    def showEvent(self, event):
        super().showEvent(event)
        QTimer.singleShot(0, self._recompute_and_apply_height)
        QTimer.singleShot(0, lambda: self.update_geometry(self.bar_sec_lect))

    def hideEvent(self, event):
        super().hideEvent(event)
        try:
            self.setFixedHeight(self.collapsed_height)
        except Exception:
            pass

class BarSecLect(QFrame):
    play_pause_clicked = pyqtSignal(bool)
    prev_clicked = pyqtSignal()
    next_clicked = pyqtSignal()
    chapter_prev_clicked = pyqtSignal()
    chapter_next_clicked = pyqtSignal()
    plus_10_clicked = pyqtSignal()
    moins_10_clicked = pyqtSignal()

    position_changed = pyqtSignal(int)
    chapter_selected = pyqtSignal(int)
    volume_changed = pyqtSignal(int)
    subtitle_toggled = pyqtSignal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(100)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet("background: transparent;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.slider = ChapterSlider(self)
        self.slider.setStyleSheet("background: transparent;")
        self.triple = FlexibleContainer(self)

        time_row = QHBoxLayout()
        time_row.setContentsMargins(6, 4, 6, 0)
        time_row.setSpacing(4)

        self.current_time_label = QLabel(get_text("lecteur_labels.current_time"), self)
        f = QFont()
        f.setPointSize(9)
        self.current_time_label.setFont(f)
        self.current_time_label.setStyleSheet("color: white; background: transparent;")
        self.current_time_label.setFixedHeight(16)

        self.total_time_label = QLabel(get_text("lecteur_labels.total_time"), self)
        self.total_time_label.setFont(f)
        self.total_time_label.setStyleSheet("color: white; background: transparent;")
        self.total_time_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self.total_time_label.setFixedHeight(16)

        time_row.addWidget(self.current_time_label)
        time_row.addStretch(1)
        time_row.addWidget(self.total_time_label)

        layout.addLayout(time_row)
        layout.addWidget(self.slider)
        layout.addWidget(self.triple)

        gauche_layout = QHBoxLayout(self.triple.pan1)
        gauche_layout.setContentsMargins(10, 0, 0, 0)
        gauche_layout.setSpacing(5)
        self.subtitle_btn = IconPerso(icon_only_name="mdi.translate",
                                      icon_size=QSize(30, 30),
                                      flash_color=True)
        gauche_layout.addWidget(self.subtitle_btn)
        gauche_layout.addStretch(1)

        milieu_layout = QHBoxLayout(self.triple.pan2)
        milieu_layout.setContentsMargins(0, 0, 0, 0)
        milieu_layout.setSpacing(0)
        self.triple.pan2.setLayout(milieu_layout)

        self.moins_10_btn = IconPerso(flash_color=True, icon_only_name="mdi.rewind-10", icon_size=QSize(28, 28))
        self._make_widget_transparent(self.moins_10_btn)
        self.chapter_prev_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-backward", icon_size=QSize(28, 28))
        self._make_widget_transparent(self.chapter_prev_btn)
        self.prev_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-previous", icon_size=QSize(30, 30))
        self._make_widget_transparent(self.prev_btn)
        self.play_pause_btn = IconPerso(initial_state=True,
                                        icon_true_name="mdi.pause-circle",
                                        icon_false_name="mdi.play-circle",
                                        icon_size=QSize(42, 42))
        self._make_widget_transparent(self.play_pause_btn)
        self.next_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-next", icon_size=QSize(30, 30))
        self._make_widget_transparent(self.next_btn)
        self.chapter_next_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-forward", icon_size=QSize(28, 28))
        self._make_widget_transparent(self.chapter_next_btn)
        self.plus_10_btn = IconPerso(flash_color=True, icon_only_name="mdi.fast-forward-10", icon_size=QSize(28, 28))
        self._make_widget_transparent(self.plus_10_btn)

        milieu_layout.addWidget(self.moins_10_btn)
        milieu_layout.addWidget(self.chapter_prev_btn)
        milieu_layout.addWidget(self.prev_btn)
        milieu_layout.addWidget(self.play_pause_btn)
        milieu_layout.addWidget(self.next_btn)
        milieu_layout.addWidget(self.chapter_next_btn)
        milieu_layout.addWidget(self.plus_10_btn)

        droite_layout = QHBoxLayout(self.triple.pan3)
        droite_layout.setContentsMargins(0, 0, 10, 0)
        droite_layout.setSpacing(0)
        self.triple.pan3.setLayout(droite_layout)
        self.volume_control = VolumeControlLect(self)
        droite_layout.addWidget(self.volume_control)

        self.subtitle_btn.clicked.connect(self._on_subtitle_toggled)
        self.play_pause_btn.state_changed.connect(self._on_play_pause_toggled)
        self.prev_btn.clicked.connect(self.prev_clicked.emit)
        self.next_btn.clicked.connect(self.next_clicked.emit)
        self.chapter_prev_btn.clicked.connect(self.chapter_prev_clicked.emit)
        self.chapter_next_btn.clicked.connect(self.chapter_next_clicked.emit)
        self.plus_10_btn.clicked.connect(self.plus_10_clicked.emit)
        self.moins_10_btn.clicked.connect(self.moins_10_clicked.emit)

        self.slider.position_changed.connect(self.position_changed.emit)
        self.slider.position_released.connect(self.position_changed.emit)
        self.slider.chapter_clicked.connect(self.chapter_selected.emit)

        self.slider.position_changed.connect(self._on_slider_position_changed_internal)
        self.slider.position_released.connect(self._on_slider_position_changed_internal)

        self.volume_control.volume_changed.connect(self.volume_changed.emit)

        self.barLangueSub = BarLangueSub()
        self.barLangueSub.link_with_bar(self)

        self.barLangueSub = BarLangueSub()
        self.barLangueSub.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.Tool
            | Qt.WindowType.WindowStaysOnTopHint
        )
        self.barLangueSub.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.barLangueSub.hide()

    def _is_subtitle_btn_checked(self):
        try:
            if hasattr(self.subtitle_btn, "isChecked"):
                return bool(self.subtitle_btn.isChecked())
            if hasattr(self.subtitle_btn, "checked"):
                return bool(getattr(self.subtitle_btn, "checked"))
            if hasattr(self.subtitle_btn, "state"):
                return bool(getattr(self.subtitle_btn, "state"))
            if hasattr(self.subtitle_btn, "get_state"):
                return bool(self.subtitle_btn.get_state())
        except Exception:
            pass
        return False

    def showEvent(self, event):
        super().showEvent(event)
        if self._is_subtitle_btn_checked():
            try:
                slider_global_topleft = self.slider.mapToGlobal(QPoint(0, 0))
                self.barLangueSub.setFixedWidth(self.slider.width())
                self.barLangueSub.move(slider_global_topleft.x(),
                                       slider_global_topleft.y() - self.barLangueSub.height())
            except Exception:
                pass
            self.barLangueSub.show()

    def hideEvent(self, event):
        # Ne pas cacher le menu des sous-titres si la barre est cachée
        super().hideEvent(event)

    @staticmethod
    def _make_widget_transparent(widget):
        try:
            widget.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
            widget.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
        except Exception as e:
            print(e)
            pass
        widget.setAutoFillBackground(False)
        widget.setStyleSheet("background: transparent; border: none;")

    def paintEvent(self, event):
        return

    def _on_play_pause_toggled(self, is_playing):
        self.play_pause_clicked.emit(is_playing)

    def _on_subtitle_toggled(self, state):
        try:
            visible = state if state is not None else not self.barLangueSub.isVisible()

            if visible:
                slider = self.slider
                global_pos = slider.mapToGlobal(QPoint(0, 0))
                self.barLangueSub.setFixedWidth(slider.width())
                self.barLangueSub.move(
                    global_pos.x(),
                    global_pos.y() - self.barLangueSub.height()
                )
                self.barLangueSub.show()
            else:
                self.barLangueSub.hide()

            if hasattr(self.subtitle_btn, "set_state"):
                self.subtitle_btn.set_state(visible)
            elif hasattr(self.subtitle_btn, "setChecked"):
                self.subtitle_btn.setChecked(visible)

        except Exception as e:
            logger.error(f"Erreur toggle subtitle: {e}")

    @staticmethod
    def _format_time_simple(seconds):
        try:
            if seconds is None:
                return "—"
            s = int(round(float(seconds)))
            if s < 60:
                return f"{s:02d}"
            # une heure ou plus : HH:MM:SS
            if s >= 3600:
                h = s // 3600
                m = (s % 3600) // 60
                sec = s % 60
                return f"{h:02d}:{m:02d}:{sec:02d}"
            # sinon : MM:SS
            m = s // 60
            sec = s % 60
            return f"{m:02d}:{sec:02d}"
        except Exception:
            return "—"

    def resizeEvent(self, event):
        super().resizeEvent(event)
        try:
            self.barLangueSub.setFixedWidth(self.slider.width())
            slider_global_topleft = self.slider.mapToGlobal(QPoint(0, 0))
            self.barLangueSub.move(slider_global_topleft.x(), slider_global_topleft.y() - self.barLangueSub.height())
        except Exception:
            pass

    def set_current_time(self, seconds):
        try:
            txt = self._format_time_simple(seconds)
            self.current_time_label.setText(txt)
        except Exception:
            pass

    def set_duration(self, seconds):
        try:
            try:
                self.slider.set_duration(seconds)
            except Exception:
                pass
            if seconds is None:
                self.total_time_label.setText("—")
            else:
                self.total_time_label.setText(self._format_time_simple(seconds))
        except Exception as e:
            print(f"BarSecLect.set_duration erreur: {e}")

    def set_chapters(self, chapters):
        normalized = []
        for c in chapters:
            if isinstance(c, dict):
                start = c.get("start") or c.get("start_time") or c.get("time")
                if start is not None:
                    try:
                        normalized.append(float(start))
                    except Exception as e:
                        print(e)
                        pass
            else:
                try:
                    normalized.append(float(c))
                except Exception as e:
                    print(e)
                    pass
        self.slider.set_chapters(normalized)

    def _on_slider_position_changed_internal(self, pos):
        try:
            self.set_current_time(pos)
        except Exception:
            pass