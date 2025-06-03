def filtrer_et_afficher(parent, max_minutes, audio, st):
    """
    Filtre les vidéos selon les critères donnés et les affiche dans la vue parent.
    """
    video_manager = getattr(parent, 'video_manager', None)
    if video_manager is None:
        raise AttributeError("L'objet parent ne possède pas d'attribut 'video_manager'.")

    videos = video_manager.charger_videos()
    filtered = video_manager.advanced_filter(
        videos,
        max_duree_h=max_minutes / 60,
        langue_audio=audio,
        langue_sous_titre=st
    )

    if getattr(parent, 'mode_affichage', None) == 'grille':
        new_items = [parent._creer_carte_video_graphique(v) for v in filtered]
        for item, v in zip(new_items, filtered):
            item.video = v
        parent.graphics_view.ajouter_items(new_items)
    else:
        parent._mettre_a_jour_liste(filtered)