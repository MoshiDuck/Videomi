def format_duration(raw_duration):
    total_secs = int(raw_duration or 0)
    h = total_secs // 3600
    m = (total_secs % 3600) // 60
    s = total_secs % 60
    return f"{h:02d}:{m:02d}:{s:02d}"