class TrierAZ:
    def __init__(self, reverse: bool = False):
        """
        :param reverse: False = ordre croissant (A → Z), True = ordre décroissant (Z → A)
        """
        self.reverse = reverse

    def sort(self, items: list, key=lambda x: x.title.text()):
        return sorted(items, key=key, reverse=self.reverse)