# main.py
import pythoncom

from init import Init
import faulthandler
faulthandler.enable(all_threads=True)
pythoncom.CoInitializeEx(pythoncom.COINIT_MULTITHREADED)
if __name__ == "__main__":
    init = Init()
    init.run()

