from datetime import timedelta

class TrierTime:
    def __init__(self, reverse: bool = False):
        """
        :param reverse: False = ordre croissant (court → long), True = ordre décroissant (long → court)
        """
        self.reverse = reverse

    @staticmethod
    def _parse_duration(duration_str: str) -> timedelta:
        """Convertit une chaîne HH:MM:SS en timedelta pour trier correctement."""
        try:
            h, m, s = map(int, duration_str.split(":"))
            return timedelta(hours=h, minutes=m, seconds=s)
        except ValueError:
            return timedelta()  # Si le format est invalide, on retourne 0

    def sort(self, items: list):
        return sorted(
            items,
            key=lambda x: self._parse_duration(x.duration.text()),
            reverse=self.reverse
        )
