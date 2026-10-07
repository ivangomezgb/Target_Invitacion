document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------------------------------------------
  // 1. PEGA AQUÍ TU URL DE GOOGLE APPS SCRIPT
  // -----------------------------------------------------------------
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzfhK6MEdJS32IF8mnusMW4jEEeK7ATt-ATt7Cj9N4GPxh57dwfiHD8BK9t6W8sDFzs1g/exec';

  // Referencias a elementos del DOM
  const form = document.getElementById('rsvpForm');
  const statusMessage = document.getElementById('statusMessage');
  const netStatus = document.getElementById('netStatus');
  const netText = document.getElementById('netText');
  const confettiContainer = document.getElementById('confettiContainer');

  // -----------------------------------------------------------------
  // 2. DETECCIÓN Y CONTROL DEL ESTADO DE RED
  // -----------------------------------------------------------------
  function updateOnlineStatus() {
    if (navigator.onLine) {
      netStatus.className = 'net-badge online';
      netText.textContent = 'En línea';
      syncOfflineData(); // Sincroniza datos guardados cuando vuelve el internet
    } else {
      netStatus.className = 'net-badge offline';
      netText.textContent = 'Modo Offline';
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // -----------------------------------------------------------------
  // 3. BASE DE DATOS LOCAL (IndexedDB para Persistencia Offline)
  // -----------------------------------------------------------------
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ConfirmacionesDB', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('asistencias')) {
          db.createObjectStore('asistencias', { autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveLocalRSVP(data) {
    try {
      const db = await openDB();
      const tx = db.transaction('asistencias', 'readwrite');
      tx.objectStore('asistencias').add(data);
      return tx.complete;
    } catch (err) {
      console.error('Error al guardar localmente en IndexedDB:', err);
    }
  }

  // -----------------------------------------------------------------
  // 4. ENVÍO A GOOGLE SHEETS Y SINCRONIZACIÓN
  // -----------------------------------------------------------------
  async function sendToGoogleSheets(data) {
    // Usamos text/plain para evitar errores de preflight CORS con Google Apps Script
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async function syncOfflineData() {
    // Si no se ha configurado la URL, no intenta sincronizar
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('AQUI_PEGA_TU_URL')) return;

    try {
      const db = await openDB();
      const tx = db.transaction('asistencias', 'readwrite');
      const store = tx.objectStore('asistencias');
      const request = store.getAll();

      request.onsuccess = async () => {
        const registros = request.result;
        if (registros && registros.length > 0) {
          console.log(`Sincronizando ${registros.length} registro(s) guardado(s) offline...`);
          
          for (const item of registros) {
            await sendToGoogleSheets(item);
          }

          // Tras subir todos los datos exitosamente, limpiamos la BD local
          const clearTx = db.transaction('asistencias', 'readwrite');
          clearTx.objectStore('asistencias').clear();
          console.log('Sincronización completada con éxito.');
        }
      };
    } catch (err) {
      console.error('Error durante la sincronización offline:', err);
    }
  }

  // -----------------------------------------------------------------
  // 5. EFECTO INTERACTIVO DE CONFETI NATIVO
  // -----------------------------------------------------------------
  function launchConfetti() {
    const colors = ['#D4AF37', '#0F172A', '#F4EFE6', '#22C55E', '#3B82F6'];
    for (let i = 0; i < 45; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      confettiContainer.appendChild(piece);

      setTimeout(() => piece.remove(), 4000);
    }
  }

  // -----------------------------------------------------------------
  // 6. MANEJO DEL EVENTO DE ENVÍO DEL FORMULARIO
  // -----------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = document.getElementById('nombre').value.trim();
    const asistencia = document.getElementById('asistencia').value;

    if (!nombre || !asistencia) {
      showStatus('Por favor, completa todos los campos obligatorios.', 'warning');
      return;
    }

    const payload = {
      nombre: nombre,
      asistencia: asistencia,
      timestamp: new Date().toLocaleString("es-CO")
    };

    if (navigator.onLine && GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes('AQUI_PEGA_TU_URL')) {
      try {
        await sendToGoogleSheets(payload);
        if (asistencia.includes('Sí')) launchConfetti();
        showStatus(`¡Gracias ${nombre}! Tu asistencia ha sido registrada en la lista.`, 'success');
        form.reset();
      } catch (error) {
        console.error('Error de envío online, guardando offline como respaldo:', error);
        await saveLocalRSVP(payload);
        if (asistencia.includes('Sí')) launchConfetti();
        showStatus(`Conexión inestable. Tu confirmación quedó guardada y se sincronizará automáticamente.`, 'warning');
        form.reset();
      }
    } else {
      // Modo Offline o URL no configurada aún
      await saveLocalRSVP(payload);
      if (asistencia.includes('Sí')) launchConfetti();
      showStatus(`Modo Offline. Guardamos tu respuesta en el dispositivo y se enviará a Google Sheets apenas te conectes a internet.`, 'warning');
      form.reset();
    }
  });

  function showStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-message ${type}`;
  }
});