import requests


def get_btc_price():
    """Récupère le prix BTC en USD via CoinGecko."""
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        return data['bitcoin']['usd']
    except Exception as e:
        print("Erreur récupération prix BTC :", e)
        return None


def get_gomining_price():
    """Récupère le prix GoMining Token (GMT) en USD via CoinGecko."""
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=gmt-token&vs_currencies=usd"
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
        return float(data['gmt-token']['usd'])
    except Exception as e:
        print("Erreur récupération prix GoMining Token :", e)
        return None


def get_btc_difficulty():
    """Récupère la difficulté réseau BTC depuis Blockchain.info."""
    try:
        url = "https://blockchain.info/q/getdifficulty"
        response = requests.get(url)
        response.raise_for_status()
        return float(response.text)
    except Exception as e:
        print("Erreur récupération difficulté BTC :", e)
        return None


def get_btc_hashrate():
    """Récupère le hashrate moyen du réseau BTC en TH/s depuis Blockchain.info."""
    try:
        url = "https://api.blockchain.info/charts/hash-rate?format=json&timespan=30days"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        values = data.get('values', [])
        if not values:
            print("Aucune donnée disponible pour le hashrate.")
            return None
        hashrate_hs = values[-1]['y']  # dernière valeur disponible
        return hashrate_hs / 1e12  # H/s → TH/s
    except Exception as e:
        print("Erreur récupération hashrate :", e)
        return None


def calculate_fees_and_rewards(th, total_discount):
    """Calcule récompenses et frais pour un mineur selon TH et remise totale."""
    reward_per_th = 49  # satoshi par TH
    reward = reward_per_th * th

    # Frais d'électricité et service appliquant la remise totale
    electricity_fee = (0.05 * 24 * 15 / 0.5179 / 1000) * th * (1 - total_discount / 100)
    service_fee = (0.0089 / 0.5179) * th * (1 - total_discount / 100)

    return reward, electricity_fee, service_fee


def main():
    try:
        th = float(input("Entrez votre TH actuel : "))
        total_discount = float(input("Entrez la remise totale en % : "))

        btc_price = get_btc_price()
        gmt_price = get_gomining_price()
        difficulty = get_btc_difficulty()
        network_hashrate = get_btc_hashrate()

        if btc_price is None or gmt_price is None or difficulty is None or network_hashrate is None:
            print("Impossible de récupérer toutes les données nécessaires, sortie.")
            return

        reward, electricity_fee, service_fee = calculate_fees_and_rewards(th, total_discount)

        print("\n=== Résultats du calcul ===")
        print(f"Récompense en satoshi : {reward:.2f} sat")
        print(f"Frais d'électricité : {electricity_fee:.8f} GOMINING")
        print(f"Coût du service : {service_fee:.8f} GOMINING")
        print(f"Remise totale appliquée : {total_discount:.2f}%")
        print(f"Prix BTC actuel : ${btc_price:.2f}")
        print(f"Prix GoMining Token (GMT) actuel : ${gmt_price:.4f}")
        print(f"Difficulté réseau : {difficulty:.2f}")
        print(f"Hashrate réseau : {network_hashrate:.2f} TH/s")

    except Exception as e:
        print("Erreur lors du calcul :", e)


if __name__ == "__main__":
    main()
