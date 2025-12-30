// generateSecretKey.js

function generateSecretKey(length = 64) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);

    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    const base64 = btoa(binary);
    return base64;
}

// Générer une clé et l'afficher
const key = generateSecretKey();
console.log('🔑 Clé générée :', key);
