from PyQt6.QtCore import QUrl
from PyQt6.QtWidgets import QWidget, QVBoxLayout
from PyQt6.QtWebEngineWidgets import QWebEngineView
import time


class Banner(QWidget):
    def __init__(self):
        super().__init__()
        self.setFixedSize(728, 90)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.webview = QWebEngineView()
        self.webview.setFixedSize(728, 90)
        layout.addWidget(self.webview)

        self.refresh()

    def refresh(self):
        timestamp = int(time.time() * 1000)
        html_content = f"""
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <title>Bannière Adsterra 728×90</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            html, body {{
              margin: 0;
              padding: 0;
              background: transparent;
              height: 100vh;
              display: flex;
              justify-content: center;
              align-items: center;
            }}
          </style>
        </head>
        <body>
          <script type="text/javascript">
            atOptions = {{
              'key' : '494244b514fea075172c85491904fbe3',
              'format' : 'iframe',
              'height' : 90,
              'width' : 728,
              'params' : {{}}
            }};
          </script>
          <script type="text/javascript"
                  src="https://www.highperformanceformat.com/494244b514fea075172c85491904fbe3/invoke.js?t={timestamp}">
          </script>
        </body>
        </html>
        """
        self.webview.setHtml(html_content, QUrl("https://www.highperformanceformat.com"))