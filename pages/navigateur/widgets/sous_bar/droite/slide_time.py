from PyQt6 import QtWidgets, QtCore, QtGui
from config.colors import PRIMARY_COLOR, TEXT_COLOR_LIGHT
SLIDER_STYLE = f"""
QSlider::handle:horizontal {{
    background: {PRIMARY_COLOR};
    border-radius: 10px;
    width: 20px; height: 20px; margin: -7px 0;
}}
QSlider::groove:horizontal {{
    height: 6px;
    background: {TEXT_COLOR_LIGHT};
    border-radius: 3px;
}}
QSlider::sub-page:horizontal {{
    background: {PRIMARY_COLOR};
    border-radius: 3px;
}}
"""

class SlideTime(QtWidgets.QSlider):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setStyleSheet(SLIDER_STYLE)

    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.MouseButton.LeftButton:
            opt = QtWidgets.QStyleOptionSlider()
            self.initStyleOption(opt)

            style = self.style()
            groove_rect = style.subControlRect(
                QtWidgets.QStyle.ComplexControl.CC_Slider, opt,
                QtWidgets.QStyle.SubControl.SC_SliderGroove, self
            )
            handle_rect = style.subControlRect(
                QtWidgets.QStyle.ComplexControl.CC_Slider, opt,
                QtWidgets.QStyle.SubControl.SC_SliderHandle, self
            )

            handle_top_left = self.mapFromGlobal(self.mapToGlobal(QtCore.QPoint(0, 0)) + handle_rect.topLeft())
            handle_rect = QtCore.QRect(handle_top_left, handle_rect.size())

            if not handle_rect.contains(event.position().toPoint()):
                if self.orientation() == QtCore.Qt.Orientation.Horizontal:
                    pos_x = int(event.position().x())
                    val = QtWidgets.QStyle.sliderValueFromPosition(
                        self.minimum(), self.maximum(),
                        pos_x - groove_rect.x(), groove_rect.width()
                    )
                    self.setValue(val)
                    event.accept()
                    return

        super().mousePressEvent(event)
