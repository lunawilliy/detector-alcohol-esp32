const FIREBASE_URL = "https://detectoralcoholesp32-default-rtdb.firebaseio.com/sensor.json";

const txtEstado = document.getElementById("txtEstado");
const statusBanner = document.getElementById("statusBanner");
const valAlcohol = document.getElementById("valAlcohol");
const barAlcohol = document.getElementById("barAlcohol");
const btnRemoto = document.getElementById("btnRemoto");
const valConsumo = document.getElementById("valConsumo");
const valTiempoActual = document.getElementById("valTiempoActual");
const txtRecord = document.getElementById("txtRecord");
const valRacha = document.getElementById("valRacha");
const txtRachaMensaje = document.getElementById("txtRachaMensaje");

let datosActuales = { alcohol: 0, pot: 0, pwm: 0, estado: "", botonWeb: 0, consumido: 0, tiempoActual: 0 };
let enPenitencia = false;
let tiempoPenitencia = 0;

// Cargar récords guardados permanentemente en el dispositivo
let recordTiempo = parseFloat(localStorage.getItem("recordTiempo")) || 0.0;
let rachaActual = parseInt(localStorage.getItem("rachaActual")) || 0;
let ultimoTiempoEvaluado = 0;

const TIEMPO_MINIMO_RACHA = 3.0; 
const LIMITE_BEBIDA_PENITENCIA = 500; 

// Renderizar valores históricos guardados al abrir la web
txtRecord.innerHTML = `🏆 Récord: ${recordTiempo.toFixed(1)}s`;
valRacha.innerHTML = `${rachaActual} <small>🔥</small>`;

async function obtenerDatosFirebase() {
    if (enPenitencia) {
        manejarPenitencia();
        return;
    }

    try {
        const respuesta = await fetch(FIREBASE_URL);
        const data = await respuesta.json();
        
        if (data) {
            datosActuales = data;
            
            // Renderizar los valores en tiempo real (Incluyendo ml)
            valAlcohol.innerText = data.alcohol;
            valConsumo.innerText = `${data.consumido} ml`;
            valTiempoActual.innerText = `${data.tiempoActual.toFixed(1)} s`;

            let porcAlcohol = Math.min(Math.round((data.alcohol / 4095) * 100), 100);
            barAlcohol.style.width = `${porcAlcohol}%`;

            // 🕹️ DETECTOR DE FIN DE SORBO CRÍTICO
            if (data.tiempoActual === 0 && ultimoTiempoEvaluado > 0) {
                evaluarSorboCompletado(ultimoTiempoEvaluado);
                ultimoTiempoEvaluado = 0;
            } 
            
            if (data.tiempoActual > 0) {
                ultimoTiempoEvaluado = data.tiempoActual;
            }

            if (data.consumido >= LIMITE_BEBIDA_PENITENCIA) {
                activarPenitencia();
                return;
            }

            // Gestión de mensajes dinámicos
            if (data.estado.includes("MUY EBRIO")) {
                statusBanner.className = "banner-penitencia";
                txtEstado.innerHTML = "🛑 ¡FIESTA TERMINADA! Nivel de alcohol peligroso.";
            } else {
                statusBanner.className = "banner-normal";
                if (data.tiempoActual > 0) {
                    txtEstado.innerHTML = `🔥 CHUPANDO EN VIVO: ${data.tiempoActual.toFixed(1)}s... ¡Dale, dale!`;
                } else {
                    txtEstado.innerHTML = "🕺 ¡Pon a prueba tu racha! Presiona el botón o succiona.";
                }
            }

            actualizarVisualBoton(data.botonWeb);
        }
    } catch (e) {
        console.error("Error Firebase:", e);
    }
}

function evaluarSorboCompletado(tiempoFinal) {
    if (tiempoFinal > recordTiempo) {
        recordTiempo = tiempoFinal;
        localStorage.setItem("recordTiempo", recordTiempo); // Guardar permanentemente
        txtRecord.innerHTML = `🏆 Récord: ${recordTiempo.toFixed(1)}s`;
        rachaActual++;
        txtRachaMensaje.innerHTML = "⚡ ¡NUEVO RÉCORD! Tu racha sube.";
    } 
    else if (tiempoFinal >= TIEMPO_MINIMO_RACHA) {
        rachaActual++;
        txtRachaMensaje.innerHTML = "✅ ¡Buen sorbo! Racha mantenida.";
    } 
    else {
        rachaActual = 0;
        txtRachaMensaje.innerHTML = "❌ ¡Succión muy corta! Racha rota.";
    }

    localStorage.setItem("rachaActual", rachaActual); // Guardar racha permanentemente
    valRacha.innerHTML = `${rachaActual} <small>🔥</small>`;
}

function activarPenitencia() {
    enPenitencia = true;
    tiempoPenitencia = 15; // 15 segundos de penitencia
    btnRemoto.disabled = true;
    statusBanner.className = "banner-penitencia";
}

function manejarPenitencia() {
    if (tiempoPenitencia > 0) {
        txtEstado.innerHTML = `🚨 ¡PENITENCIA POR EXCESO!`;
        btnRemoto.innerText = `BLOQUEADO (${tiempoPenitencia}s)`;
        tiempoPenitencia--;
    } else {
        enPenitencia = false;
        btnRemoto.disabled = false;
        rachaActual = 0;
        localStorage.setItem("rachaActual", 0);
        valRacha.innerHTML = `0 <small>🔥</small>`;
        txtRachaMensaje.innerHTML = "¡Penitencia cumplida! Contadores listos.";
        
        datosActuales.consumido = 0;
        datosActuales.botonWeb = 0;
        datosActuales.tiempoActual = 0;
        datosActuales.estado = "Esperando acción";
        
        fetch(FIREBASE_URL, {
            method: "PUT",
            body: JSON.stringify(datosActuales),
            headers: { "Content-Type": "application/json" }
        });
    }
}

function actualizarVisualBoton(estado) {
    if (estado === 1) {
        btnRemoto.innerHTML = '<i class="fa-solid fa-circle-stop"></i> DETENER FLUJO';
        btnRemoto.className = "btn-on";
    } else {
        btnRemoto.innerHTML = '<i class="fa-solid fa-beer-mug-empty"></i> ENCENDER BOMBEO';
        btnRemoto.className = "btn-off";
    }
}

btnRemoto.addEventListener("click", async () => {
    if (enPenitencia) return;
    
    datosActuales.botonWeb = datosActuales.botonWeb === 1 ? 0 : 1;
    actualizarVisualBoton(datosActuales.botonWeb);
    
    await fetch(FIREBASE_URL, {
        method: "PUT",
        body: JSON.stringify(datosActuales),
        headers: { "Content-Type": "application/json" }
    });
});

setInterval(obtenerDatosFirebase, 300);