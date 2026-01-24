// INFO : app/utils/i18n.ts
// Système de traduction multilingue

export type Language = 'fr' | 'en' | 'es' | 'de';

export interface Translations {
    // Navigation
    nav: {
        home: string;
        upload: string;
        files: string;
        profile: string;
        logout: string;
    };
    // Common
    common: {
        loading: string;
        error: string;
        success: string;
        cancel: string;
        confirm: string;
        retry: string;
        delete: string;
        save: string;
        close: string;
    };
    // Login
    login: {
        title: string;
        subtitle: string;
        connectWithGoogle: string;
        electronMode: string;
        terms: string;
        configError: string;
        configUnavailable: string;
    };
    // Home
    home: {
        title: string;
        welcome: string;
        stats: string;
        statsDescription: string;
        fileCount: string;
        totalSize: string;
        billing: string;
        billingDescription: string;
        amountToPay: string;
        monthlyBilling: string;
        for: string;
        rate: string;
    };
    // Upload
    upload: {
        title: string;
        selectFile: string;
        dragDrop: string;
        globalProgress: string;
        filesCompleted: string;
        inProgress: string;
        totalSpeed: string;
        timeRemaining: string;
        uploaded: string;
        showDetails: string;
        hideDetails: string;
        pause: string;
        resume: string;
        cancel: string;
        completed: string;
        error: string;
        noUploads: string;
        status: string;
        size: string;
        speed: string;
        remainingTime: string;
    };
    // Categories
    categories: {
        videos: string;
        musics: string;
        images: string;
        documents: string;
        archives: string;
        executables: string;
        others: string;
    };
    // Videos page (Films & Séries)
    videos: {
        films: string;
        series: string;
        unidentifiedFiles: string;
        myVideos: string;
        myFilms: string;
        mySeries: string;
        clickToIdentify: string;
        tvShows: string;
        collections: string;
        film: string;
        season: string;
        episode: string;
        recentlyAdded: string;
    };
    // Empty states
    emptyStates: {
        noVideos: string;
        noVideosDescription: string;
        uploadFirstVideo: string;
        noFilms: string;
        noFilmsDescription: string;
        uploadFirstFilm: string;
        noSeries: string;
        noSeriesDescription: string;
        uploadFirstSeries: string;
        noMusics: string;
        noMusicsDescription: string;
        uploadFirstMusic: string;
        noImages: string;
        noImagesDescription: string;
        uploadFirstImage: string;
        noDocuments: string;
        noDocumentsDescription: string;
        uploadFirstDocument: string;
        noArchives: string;
        noArchivesDescription: string;
        uploadFirstArchive: string;
        noExecutables: string;
        noExecutablesDescription: string;
        uploadFirstExecutable: string;
        noOthers: string;
        noOthersDescription: string;
        uploadFile: string;
    };
    // Profile
    profile: {
        title: string;
        subtitle: string;
        language: string;
        languageDescription: string;
    };
    // Dialogs
    dialogs: {
        logoutTitle: string;
        logoutMessage: string;
    };
    // Errors
    errors: {
        fetchFailed: string;
        unknown: string;
        networkError: string;
        statsLoadFailed: string;
        authFailed: string;
        saveFailed: string;
        deleteFailed: string;
        loadFailed: string;
        title: string;
        retry: string;
    };
}

const translations: Record<Language, Translations> = {
    fr: {
        nav: {
            home: 'Accueil',
            upload: 'Upload',
            files: 'Fichiers',
            profile: 'Profil',
            logout: 'Déconnexion'
        },
        common: {
            loading: 'Chargement en cours...',
            error: 'Erreur',
            success: 'Succès',
            cancel: 'Annuler',
            confirm: 'Confirmer',
            retry: 'Réessayer',
            delete: 'Supprimer',
            save: 'Enregistrer',
            close: 'Fermer'
        },
        login: {
            title: 'Videomi',
            subtitle: 'Connectez-vous pour accéder à votre espace',
            connectWithGoogle: 'Se connecter avec Google :',
            electronMode: 'Mode Electron actif - L\'authentification s\'ouvrira dans une fenêtre Electron',
            terms: 'En vous connectant, vous acceptez nos conditions d\'utilisation et notre politique de confidentialité.',
            configError: 'Erreur de configuration',
            configUnavailable: 'Configuration non disponible. Veuillez réessayer plus tard.'
        },
        home: {
            title: 'Tableau de bord',
            welcome: 'Bienvenue sur votre espace personnel, {name}',
            stats: 'Statistiques',
            statsDescription: 'Vue d\'ensemble de votre activité',
            fileCount: 'Nombre de fichiers',
            totalSize: 'Go upload',
            billing: 'Montant à payer',
            billingDescription: 'Facturation mensuelle',
            amountToPay: 'Montant à payer',
            monthlyBilling: 'Facturation mensuelle',
            for: 'pour',
            rate: 'Tarif: 0,030 $/GB-mois (arrondi à la hausse)'
        },
        upload: {
            title: 'Gestionnaire d\'upload',
            selectFile: 'Sélectionner un fichier',
            dragDrop: 'Glissez-déposez votre fichier ici',
            dragDropOr: 'ou cliquez pour parcourir vos fichiers',
            supportedFormats: 'Formats supportés: images, vidéos, documents (max 100MB)',
            globalProgress: 'Progression globale',
            filesCompleted: 'fichiers terminés',
            inProgress: 'en cours',
            totalSpeed: 'Vitesse totale',
            timeRemaining: 'Temps restant',
            uploaded: 'Uploadé',
            showDetails: 'Afficher les détails',
            hideDetails: 'Masquer les détails',
            pause: 'Pause',
            resume: 'Reprendre',
            cancel: 'Annuler',
            completed: 'Terminé',
            error: 'Erreur',
            noUploads: 'Aucun upload en cours',
            status: 'Statut',
            size: 'Taille',
            speed: 'Vitesse',
            remainingTime: 'Temps restant'
        },
        videos: {
            films: 'Films',
            series: 'Séries',
            unidentifiedFiles: 'Fichiers à identifier',
            myVideos: 'Mes vidéos',
            myFilms: 'Mes films',
            mySeries: 'Mes séries',
            clickToIdentify: 'Cliquez pour identifier',
            tvShows: 'Séries TV',
            collections: 'Collections',
            film: 'film',
            season: 'saison',
            episode: 'Épisode',
            recentlyAdded: 'Ajoutés récemment'
        },
        categories: {
            videos: 'Vidéos',
            musics: 'Musiques',
            images: 'Images',
            documents: 'Documents',
            archives: 'Archives',
            executables: 'Exécutables',
            others: 'Autres'
        },
        emptyStates: {
            noVideos: 'Aucune vidéo',
            noVideosDescription: 'Commencez à construire votre bibliothèque de vidéos',
            uploadFirstVideo: '📤 Uploadez votre première vidéo',
            noFilms: 'Aucun film',
            noFilmsDescription: 'Uploadez vos films pour les ajouter à votre collection',
            uploadFirstFilm: '📤 Uploadez votre premier film',
            noSeries: 'Aucune série',
            noSeriesDescription: 'Uploadez vos épisodes de séries TV',
            uploadFirstSeries: '📤 Uploadez votre première série',
            noMusics: 'Aucune musique',
            noMusicsDescription: 'Commencez à construire votre bibliothèque musicale',
            uploadFirstMusic: '📤 Uploadez votre première musique',
            noImages: 'Aucune image',
            noImagesDescription: 'Commencez à construire votre galerie d\'images',
            uploadFirstImage: '📤 Uploadez votre première image',
            noDocuments: 'Aucun document',
            noDocumentsDescription: 'Commencez à organiser vos documents',
            uploadFirstDocument: '📤 Uploadez votre premier document',
            noArchives: 'Aucune archive',
            noArchivesDescription: 'Commencez à organiser vos fichiers d\'archive',
            uploadFirstArchive: '📤 Uploadez votre première archive',
            noExecutables: 'Aucun exécutable',
            noExecutablesDescription: 'Organisez vos fichiers exécutables',
            uploadFirstExecutable: '📤 Uploadez votre premier exécutable',
            noOthers: 'Aucun autre fichier',
            noOthersDescription: 'Les fichiers qui ne correspondent à aucune catégorie apparaîtront ici',
            uploadFile: '📤 Uploadez un fichier'
        },
        profile: {
            title: 'Mon Profil',
            subtitle: 'Gérez vos informations personnelles et vos préférences',
            language: 'Langue',
            languageDescription: 'Choisissez votre langue préférée'
        },
        dialogs: {
            logoutTitle: 'Déconnexion',
            logoutMessage: 'Êtes-vous sûr de vouloir vous déconnecter ?'
        },
        errors: {
            fetchFailed: 'Impossible de récupérer les données',
            unknown: 'Une erreur inattendue est survenue',
            networkError: 'Erreur de connexion au serveur',
            statsLoadFailed: 'Impossible de charger les statistiques',
            authFailed: 'Échec de l\'authentification',
            saveFailed: 'Impossible de sauvegarder',
            deleteFailed: 'Impossible de supprimer',
            loadFailed: 'Impossible de charger le fichier',
            title: 'Erreur',
            retry: 'Réessayer'
        }
    },
    en: {
        nav: {
            home: 'Home',
            upload: 'Upload',
            files: 'Files',
            profile: 'Profile',
            logout: 'Logout'
        },
        common: {
            loading: 'Loading...',
            error: 'Error',
            success: 'Success',
            cancel: 'Cancel',
            confirm: 'Confirm',
            retry: 'Retry',
            delete: 'Delete',
            save: 'Save',
            close: 'Close'
        },
        login: {
            title: 'Videomi',
            subtitle: 'Sign in to access your space',
            connectWithGoogle: 'Sign in with Google:',
            electronMode: 'Electron mode active - Authentication will open in an Electron window',
            terms: 'By signing in, you agree to our terms of use and privacy policy.',
            configError: 'Configuration error',
            configUnavailable: 'Configuration unavailable. Please try again later.'
        },
        home: {
            title: 'Dashboard',
            welcome: 'Welcome to your personal space, {name}',
            stats: 'Statistics',
            statsDescription: 'Overview of your activity',
            fileCount: 'Number of files',
            totalSize: 'GB uploaded',
            billing: 'Amount to pay',
            billingDescription: 'Monthly billing',
            amountToPay: 'Amount to pay',
            monthlyBilling: 'Monthly billing',
            for: 'for',
            rate: 'Rate: $0.030/GB-month (rounded up)'
        },
        upload: {
            title: 'Upload Manager',
            selectFile: 'Select a file',
            dragDrop: 'Drag and drop your files here',
            globalProgress: 'Global progress',
            filesCompleted: 'files completed',
            inProgress: 'in progress',
            totalSpeed: 'Total speed',
            timeRemaining: 'Time remaining',
            uploaded: 'Uploaded',
            showDetails: 'Show details',
            hideDetails: 'Hide details',
            pause: 'Pause',
            resume: 'Resume',
            cancel: 'Cancel',
            completed: 'Completed',
            error: 'Error',
            noUploads: 'No uploads in progress',
            status: 'Status',
            size: 'Size',
            speed: 'Speed',
            remainingTime: 'Remaining time'
        },
        videos: {
            films: 'Movies',
            series: 'TV Shows',
            unidentifiedFiles: 'Files to identify',
            myVideos: 'My videos',
            myFilms: 'My movies',
            mySeries: 'My series',
            clickToIdentify: 'Click to identify',
            tvShows: 'TV Shows',
            collections: 'Collections',
            film: 'movie',
            season: 'season',
            episode: 'Episode',
            recentlyAdded: 'Recently Added'
        },
        categories: {
            videos: 'Videos',
            musics: 'Musics',
            images: 'Images',
            documents: 'Documents',
            archives: 'Archives',
            executables: 'Executables',
            others: 'Others'
        },
        emptyStates: {
            noVideos: 'No videos',
            noVideosDescription: 'Start building your video library',
            uploadFirstVideo: '📤 Upload your first video',
            noFilms: 'No movies',
            noFilmsDescription: 'Upload your movies to add them to your collection',
            uploadFirstFilm: '📤 Upload your first movie',
            noSeries: 'No TV shows',
            noSeriesDescription: 'Upload your TV show episodes',
            uploadFirstSeries: '📤 Upload your first series',
            noMusics: 'No musics',
            noMusicsDescription: 'Start building your music library',
            uploadFirstMusic: '📤 Upload your first music',
            noImages: 'No images',
            noImagesDescription: 'Start building your image gallery',
            uploadFirstImage: '📤 Upload your first image',
            noDocuments: 'No documents',
            noDocumentsDescription: 'Start organizing your documents',
            uploadFirstDocument: '📤 Upload your first document',
            noArchives: 'No archives',
            noArchivesDescription: 'Start organizing your archive files',
            uploadFirstArchive: '📤 Upload your first archive',
            noExecutables: 'No executables',
            noExecutablesDescription: 'Organize your executable files',
            uploadFirstExecutable: '📤 Upload your first executable',
            noOthers: 'No other files',
            noOthersDescription: 'Files that don\'t match any category will appear here',
            uploadFile: '📤 Upload a file'
        },
        profile: {
            title: 'My Profile',
            subtitle: 'Manage your personal information and preferences',
            language: 'Language',
            languageDescription: 'Choose your preferred language'
        },
        dialogs: {
            logoutTitle: 'Logout',
            logoutMessage: 'Are you sure you want to logout?'
        },
        errors: {
            fetchFailed: 'Unable to fetch data',
            unknown: 'An unexpected error occurred',
            networkError: 'Server connection error',
            statsLoadFailed: 'Unable to load statistics',
            authFailed: 'Authentication failed',
            saveFailed: 'Unable to save',
            deleteFailed: 'Unable to delete',
            loadFailed: 'Unable to load file',
            title: 'Error',
            retry: 'Retry'
        }
    },
    es: {
        nav: {
            home: 'Inicio',
            upload: 'Subir',
            files: 'Archivos',
            profile: 'Perfil',
            logout: 'Cerrar sesión'
        },
        common: {
            loading: 'Cargando...',
            error: 'Error',
            success: 'Éxito',
            cancel: 'Cancelar',
            confirm: 'Confirmar',
            retry: 'Reintentar',
            delete: 'Eliminar',
            save: 'Guardar',
            close: 'Cerrar'
        },
        login: {
            title: 'Videomi',
            subtitle: 'Inicia sesión para acceder a tu espacio',
            connectWithGoogle: 'Iniciar sesión con Google:',
            electronMode: 'Modo Electron activo - La autenticación se abrirá en una ventana Electron',
            terms: 'Al iniciar sesión, aceptas nuestros términos de uso y política de privacidad.',
            configError: 'Error de configuración',
            configUnavailable: 'Configuración no disponible. Por favor, inténtalo de nuevo más tarde.'
        },
        home: {
            title: 'Panel de control',
            welcome: 'Bienvenido a tu espacio personal, {name}',
            stats: 'Estadísticas',
            statsDescription: 'Resumen de tu actividad',
            fileCount: 'Número de archivos',
            totalSize: 'GB subidos',
            billing: 'Cantidad a pagar',
            billingDescription: 'Facturación mensual',
            amountToPay: 'Cantidad a pagar',
            monthlyBilling: 'Facturación mensual',
            for: 'para',
            rate: 'Tarifa: $0.030/GB-mes (redondeado hacia arriba)'
        },
        upload: {
            title: 'Gestor de carga',
            selectFile: 'Seleccionar un archivo',
            dragDrop: 'Arrastra y suelta tu archivo aquí',
            dragDropOr: 'o haz clic para explorar tus archivos',
            supportedFormats: 'Formatos admitidos: imágenes, videos, documentos (máx. 100MB)',
            globalProgress: 'Progreso global',
            filesCompleted: 'archivos completados',
            inProgress: 'en progreso',
            totalSpeed: 'Velocidad total',
            timeRemaining: 'Tiempo restante',
            uploaded: 'Subido',
            showDetails: 'Mostrar detalles',
            hideDetails: 'Ocultar detalles',
            pause: 'Pausa',
            resume: 'Reanudar',
            cancel: 'Cancelar',
            completed: 'Completado',
            error: 'Error',
            noUploads: 'No hay cargas en progreso',
            status: 'Estado',
            size: 'Tamaño',
            speed: 'Velocidad',
            remainingTime: 'Tiempo restante'
        },
        videos: {
            films: 'Películas',
            series: 'Series',
            unidentifiedFiles: 'Archivos a identificar',
            myVideos: 'Mis videos',
            myFilms: 'Mis películas',
            mySeries: 'Mis series',
            clickToIdentify: 'Haz clic para identificar',
            tvShows: 'Series de TV',
            collections: 'Colecciones',
            film: 'película',
            season: 'temporada',
            episode: 'Episodio',
            recentlyAdded: 'Añadidos recientemente'
        },
        categories: {
            videos: 'Videos',
            musics: 'Músicas',
            images: 'Imágenes',
            documents: 'Documentos',
            archives: 'Archivos',
            executables: 'Ejecutables',
            others: 'Otros'
        },
        emptyStates: {
            noVideos: 'Sin videos',
            noVideosDescription: 'Comienza a construir tu biblioteca de videos',
            uploadFirstVideo: '📤 Sube tu primer video',
            noFilms: 'Sin películas',
            noFilmsDescription: 'Sube tus películas para añadirlas a tu colección',
            uploadFirstFilm: '📤 Sube tu primera película',
            noSeries: 'Sin series',
            noSeriesDescription: 'Sube tus episodios de series de TV',
            uploadFirstSeries: '📤 Sube tu primera serie',
            noMusics: 'Sin músicas',
            noMusicsDescription: 'Comienza a construir tu biblioteca musical',
            uploadFirstMusic: '📤 Sube tu primera música',
            noImages: 'Sin imágenes',
            noImagesDescription: 'Comienza a construir tu galería de imágenes',
            uploadFirstImage: '📤 Sube tu primera imagen',
            noDocuments: 'Sin documentos',
            noDocumentsDescription: 'Comienza a organizar tus documentos',
            uploadFirstDocument: '📤 Sube tu primer documento',
            noArchives: 'Sin archivos',
            noArchivesDescription: 'Comienza a organizar tus archivos',
            uploadFirstArchive: '📤 Sube tu primer archivo',
            noExecutables: 'Sin ejecutables',
            noExecutablesDescription: 'Organiza tus archivos ejecutables',
            uploadFirstExecutable: '📤 Sube tu primer ejecutable',
            noOthers: 'Sin otros archivos',
            noOthersDescription: 'Los archivos que no coincidan con ninguna categoría aparecerán aquí',
            uploadFile: '📤 Sube un archivo'
        },
        profile: {
            title: 'Mi Perfil',
            subtitle: 'Administra tu información personal y preferencias',
            language: 'Idioma',
            languageDescription: 'Elige tu idioma preferido'
        },
        dialogs: {
            logoutTitle: 'Cerrar sesión',
            logoutMessage: '¿Estás seguro de que quieres cerrar sesión?'
        },
        errors: {
            fetchFailed: 'No se pueden obtener los datos',
            unknown: 'Se produjo un error inesperado',
            networkError: 'Error de conexión al servidor',
            statsLoadFailed: 'No se pueden cargar las estadísticas',
            authFailed: 'Error de autenticación',
            saveFailed: 'No se puede guardar',
            deleteFailed: 'No se puede eliminar',
            loadFailed: 'No se puede cargar el archivo',
            title: 'Error',
            retry: 'Reintentar'
        }
    },
    de: {
        nav: {
            home: 'Startseite',
            upload: 'Hochladen',
            files: 'Dateien',
            profile: 'Profil',
            logout: 'Abmelden'
        },
        common: {
            loading: 'Wird geladen...',
            error: 'Fehler',
            success: 'Erfolg',
            cancel: 'Abbrechen',
            confirm: 'Bestätigen',
            retry: 'Wiederholen',
            delete: 'Löschen',
            save: 'Speichern',
            close: 'Schließen'
        },
        login: {
            title: 'Videomi',
            subtitle: 'Melden Sie sich an, um auf Ihren Bereich zuzugreifen',
            connectWithGoogle: 'Mit Google anmelden:',
            electronMode: 'Electron-Modus aktiv - Die Authentifizierung wird in einem Electron-Fenster geöffnet',
            terms: 'Durch die Anmeldung stimmen Sie unseren Nutzungsbedingungen und unserer Datenschutzrichtlinie zu.',
            configError: 'Konfigurationsfehler',
            configUnavailable: 'Konfiguration nicht verfügbar. Bitte versuchen Sie es später erneut.'
        },
        home: {
            title: 'Dashboard',
            welcome: 'Willkommen in Ihrem persönlichen Bereich, {name}',
            stats: 'Statistiken',
            statsDescription: 'Überblick über Ihre Aktivität',
            fileCount: 'Anzahl der Dateien',
            totalSize: 'GB hochgeladen',
            billing: 'Zu zahlender Betrag',
            billingDescription: 'Monatliche Abrechnung',
            amountToPay: 'Zu zahlender Betrag',
            monthlyBilling: 'Monatliche Abrechnung',
            for: 'für',
            rate: 'Satz: $0.030/GB-Monat (aufgerundet)'
        },
        upload: {
            title: 'Upload-Manager',
            selectFile: 'Datei auswählen',
            dragDrop: 'Ziehen Sie Ihre Datei hierher',
            dragDropOr: 'oder klicken Sie, um Ihre Dateien zu durchsuchen',
            supportedFormats: 'Unterstützte Formate: Bilder, Videos, Dokumente (max. 100MB)',
            globalProgress: 'Gesamtfortschritt',
            filesCompleted: 'Dateien abgeschlossen',
            inProgress: 'in Bearbeitung',
            totalSpeed: 'Gesamtgeschwindigkeit',
            timeRemaining: 'Verbleibende Zeit',
            uploaded: 'Hochgeladen',
            showDetails: 'Details anzeigen',
            hideDetails: 'Details ausblenden',
            pause: 'Pause',
            resume: 'Fortsetzen',
            cancel: 'Abbrechen',
            completed: 'Abgeschlossen',
            error: 'Fehler',
            noUploads: 'Keine Uploads in Bearbeitung',
            status: 'Status',
            size: 'Größe',
            speed: 'Geschwindigkeit',
            remainingTime: 'Verbleibende Zeit'
        },
        videos: {
            films: 'Filme',
            series: 'Serien',
            unidentifiedFiles: 'Zu identifizierende Dateien',
            myVideos: 'Meine Videos',
            myFilms: 'Meine Filme',
            mySeries: 'Meine Serien',
            clickToIdentify: 'Klicken Sie zum Identifizieren',
            tvShows: 'TV-Serien',
            collections: 'Sammlungen',
            film: 'Film',
            season: 'Staffel',
            episode: 'Episode',
            recentlyAdded: 'Kürzlich hinzugefügt'
        },
        categories: {
            videos: 'Videos',
            musics: 'Musik',
            images: 'Bilder',
            documents: 'Dokumente',
            archives: 'Archive',
            executables: 'Ausführbare Dateien',
            others: 'Andere'
        },
        emptyStates: {
            noVideos: 'Keine Videos',
            noVideosDescription: 'Beginnen Sie, Ihre Videobibliothek aufzubauen',
            uploadFirstVideo: '📤 Laden Sie Ihr erstes Video hoch',
            noFilms: 'Keine Filme',
            noFilmsDescription: 'Laden Sie Ihre Filme hoch, um sie Ihrer Sammlung hinzuzufügen',
            uploadFirstFilm: '📤 Laden Sie Ihren ersten Film hoch',
            noSeries: 'Keine Serien',
            noSeriesDescription: 'Laden Sie Ihre TV-Serien-Episoden hoch',
            uploadFirstSeries: '📤 Laden Sie Ihre erste Serie hoch',
            noMusics: 'Keine Musik',
            noMusicsDescription: 'Beginnen Sie, Ihre Musiksammlung aufzubauen',
            uploadFirstMusic: '📤 Laden Sie Ihre erste Musik hoch',
            noImages: 'Keine Bilder',
            noImagesDescription: 'Beginnen Sie, Ihre Bildgalerie aufzubauen',
            uploadFirstImage: '📤 Laden Sie Ihr erstes Bild hoch',
            noDocuments: 'Keine Dokumente',
            noDocumentsDescription: 'Beginnen Sie, Ihre Dokumente zu organisieren',
            uploadFirstDocument: '📤 Laden Sie Ihr erstes Dokument hoch',
            noArchives: 'Keine Archive',
            noArchivesDescription: 'Beginnen Sie, Ihre Archivdateien zu organisieren',
            uploadFirstArchive: '📤 Laden Sie Ihr erstes Archiv hoch',
            noExecutables: 'Keine ausführbaren Dateien',
            noExecutablesDescription: 'Organisieren Sie Ihre ausführbaren Dateien',
            uploadFirstExecutable: '📤 Laden Sie Ihre erste ausführbare Datei hoch',
            noOthers: 'Keine anderen Dateien',
            noOthersDescription: 'Dateien, die keiner Kategorie entsprechen, werden hier angezeigt',
            uploadFile: '📤 Laden Sie eine Datei hoch'
        },
        profile: {
            title: 'Mein Profil',
            subtitle: 'Verwalten Sie Ihre persönlichen Informationen und Einstellungen',
            language: 'Sprache',
            languageDescription: 'Wählen Sie Ihre bevorzugte Sprache'
        },
        dialogs: {
            logoutTitle: 'Abmelden',
            logoutMessage: 'Sind Sie sicher, dass Sie sich abmelden möchten?'
        },
        errors: {
            fetchFailed: 'Daten konnten nicht abgerufen werden',
            unknown: 'Ein unerwarteter Fehler ist aufgetreten',
            networkError: 'Serververbindungsfehler',
            statsLoadFailed: 'Statistiken konnten nicht geladen werden',
            authFailed: 'Authentifizierung fehlgeschlagen',
            saveFailed: 'Speichern nicht möglich',
            deleteFailed: 'Löschen nicht möglich',
            loadFailed: 'Datei konnte nicht geladen werden',
            title: 'Fehler',
            retry: 'Erneut versuchen'
        }
    }
};

/**
 * Détecte la langue de l'utilisateur
 */
export function detectLanguage(): Language {
    // Vérifier d'abord qu'on est côté client
    if (typeof window === 'undefined') {
        return 'fr'; // Fallback pour SSR
    }

    // 1. Vérifier localStorage (préférence utilisateur)
    try {
        const stored = localStorage.getItem('videomi_language');
        if (stored && (stored === 'fr' || stored === 'en' || stored === 'es' || stored === 'de')) {
            return stored as Language;
        }
    } catch (e) {
        // localStorage peut être indisponible dans certains contextes
    }

    // 2. Détecter depuis navigator.language ou navigator.languages
    if (typeof navigator !== 'undefined' && navigator.language) {
        const browserLang = navigator.language.toLowerCase();
        
        // Correspondance directe
        if (browserLang.startsWith('fr')) return 'fr';
        if (browserLang.startsWith('en')) return 'en';
        if (browserLang.startsWith('es')) return 'es';
        if (browserLang.startsWith('de')) return 'de';
        
        // Vérifier navigator.languages pour plus de précision
        if (typeof navigator !== 'undefined' && navigator.languages) {
            for (const lang of navigator.languages) {
                const langCode = lang.toLowerCase();
                if (langCode.startsWith('fr')) return 'fr';
                if (langCode.startsWith('en')) return 'en';
                if (langCode.startsWith('es')) return 'es';
                if (langCode.startsWith('de')) return 'de';
            }
        }
    }

    // 3. Détecter depuis le fuseau horaire
    if (typeof Intl !== 'undefined') {
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const tzLang = timezone.toLowerCase();
            
            // Correspondances approximatives fuseau horaire -> langue
            if (tzLang.includes('paris') || tzLang.includes('france') || tzLang.includes('brussels')) {
                return 'fr';
            }
            if (tzLang.includes('london') || tzLang.includes('new_york') || tzLang.includes('los_angeles')) {
                return 'en';
            }
            if (tzLang.includes('madrid') || tzLang.includes('mexico') || tzLang.includes('bogota')) {
                return 'es';
            }
            if (tzLang.includes('berlin') || tzLang.includes('vienna') || tzLang.includes('zurich')) {
                return 'de';
            }
        } catch (e) {
            // Ignorer les erreurs
        }
    }

    // 4. Détecter depuis l'heure locale (format de date)
    try {
        const dateFormatter = new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            hour12: false
        });
        const formatParts = dateFormatter.formatToParts(new Date());
        
        // Les pays francophones utilisent généralement 24h
        // Les pays anglophones utilisent 12h
        // (Approximation grossière, mais c'est mieux que rien)
    } catch (e) {
        // Ignorer les erreurs
    }

    // 5. Fallback par défaut : français
    return 'fr';
}

/**
 * Obtient une traduction
 */
export function t(key: string, translations: Translations): any {
    const keys = key.split('.');
    let value: any = translations;
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return key; // Retourner la clé si la traduction n'existe pas
        }
    }
    
    return value;
}

/**
 * Remplace les placeholders dans une chaîne
 */
export function replacePlaceholders(str: string, replacements: Record<string, string>): string {
    let result = str;
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
}

export { translations };
