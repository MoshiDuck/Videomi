#pagination.py


class Pagination:
    def __init__(self, items, initial_count=24, batch_count=6):
        self.items = items
        self.initial_count = initial_count
        self.batch_count = batch_count
        self.current_index = 0

    def reset(self, new_items=None):
        if new_items is not None:
            self.items = new_items
        self.current_index = 0

    def has_more(self):
        return self.current_index < len(self.items)

    def next_batch(self, initial=False):
        if initial:
            batch_size = self.initial_count
        else:
            batch_size = self.batch_count

        start = self.current_index
        end = min(start + batch_size, len(self.items))
        self.current_index = end
        return self.items[start:end]