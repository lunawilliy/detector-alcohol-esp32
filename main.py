from machine import Pin, ADC, PWM
import time
import network
import urequests

# ==========================================
# CONFIGURACIÓN DE RED
# ==========================================
ssid = "CHELAS"
password = "0987654321"

wifi = network.WLAN(network.STA_IF)
wifi.active(False)
time.sleep_ms(500)

try:
    wifi.active(True)
except OSError:
    time.sleep(1)
    wifi.active(True)

wifi.connect(ssid, password)

print("Conectando a WiFi...", end="")
while not wifi.isconnected():
    print(".", end="")
    time.sleep(0.5)

print("\nWiFi conectado con éxito.")

# ==========================================
# COMPONENTES
# ==========================================
pot = ADC(Pin(32))
pot.atten(ADC.ATTN_11DB)
pot.width(ADC.WIDTH_12BIT)

pulsador = Pin(13, Pin.IN, Pin.PULL_UP)

motor_in1 = Pin(14, Pin.OUT)
motor_en1 = PWM(Pin(12), freq=1000)

sensor_alcohol = ADC(Pin(33))
sensor_alcohol.atten(ADC.ATTN_11DB)
sensor_alcohol.width(ADC.WIDTH_12BIT)

FIREBASE_URL = "https://detectoralcoholesp32-default-rtdb.firebaseio.com/sensor.json"

UMBRAL_ALCOHOL_BLOQUEO = 2500  
UMBRAL_SUCCION_REAL = 800     
CONFIRMACIONES = 5
contador_alcohol = 0
nivel_alcohol_guardado = 350 

# Variables del Juego y Tiempo
estado_boton_web = 0 
consumo_total = 0.0  
tiempo_succionando = 0.0
inicio_succion = None

def leer_alcohol():
    suma = 0
    for i in range(10):
        suma += sensor_alcohol.read()
        time.sleep_ms(2)
    return suma // 10

def sincronizar_firebase(alcohol, pot_val, pwm, estado_str, consumo, tiempo_seg):
    global estado_boton_web
    try:
        response = urequests.get(FIREBASE_URL, timeout=1.0)
        data = response.json()
        response.close()
        if data and "botonWeb" in data:
            estado_boton_web = int(data["botonWeb"])
    except:
        pass

    try:
        data = {
            "alcohol": alcohol,
            "pot": pot_val,
            "pwm": pwm,
            "estado": estado_str,
            "consumido": int(consumo),
            "tiempoActual": round(tiempo_seg, 1), # Enviamos el cronómetro de la toma actual
            "botonWeb": estado_boton_web
        }
        response = urequests.put(FIREBASE_URL, json=data, timeout=1.0)
        response.close()
    except Exception as e:
        print("Error Firebase:", e)

print("===================================")
print(" Casco Fiestero: Arcade Edition    ")
print("===================================")
time.sleep(2)

while True:
    valor_pot = pot.read()
    potencia = int(valor_pot * 1023 / 4095)
    pulsador_presionado = (pulsador.value() == 1)

    if potencia < 970:
        nivel_alcohol = leer_alcohol()
        nivel_alcohol_guardado = nivel_alcohol  
    else:
        nivel_alcohol = nivel_alcohol_guardado  

    # ⏱️ CRONÓMETRO DE SUCCIÓN EN TIEMPO REAL
    if nivel_alcohol > UMBRAL_SUCCION_REAL:
        consumo_total += 4.0  # Suma consumo estimado
        
        if inicio_succion is None:
            inicio_succion = time.ticks_ms() # Guarda el momento exacto donde empezó a tomar
        
        tiempo_succionando = time.ticks_diff(time.ticks_ms(), inicio_succion) / 1000.0
    else:
        # Si deja de succionar, el tiempo actual se congela en Firebase para que la web evalúe la racha
        inicio_succion = None
        # Mantiene el último tiempo registrado un instante y luego vuelve a 0 si no hay flujo
        if tiempo_succionando > 0:
            sincronizar_firebase(nivel_alcohol, valor_pot, potencia, "Sorbbo terminado", consumo_total, tiempo_succionando)
            tiempo_succionando = 0.0

    # Evaluación de bloqueo crítico
    if nivel_alcohol >= UMBRAL_ALCOHOL_BLOQUEO:
        contador_alcohol += 1
    else:
        contador_alcohol = 0

    alcohol_detectado = contador_alcohol >= CONFIRMACIONES

    if alcohol_detectado:
        motor_in1.value(0)
        motor_en1.duty(0)
        estado = "MUY EBRIO - MOTOR INHABILITADO"
    else:
        if pulsador_presionado or (estado_boton_web == 1):
            if potencia < 50:
                motor_in1.value(0)
                motor_en1.duty(0)
                estado = "Motor listo"
            else:
                motor_in1.value(1)
                motor_en1.duty(potencia)
                estado = "Bombeando automáticamente"
        else:
            motor_in1.value(0)
            motor_en1.duty(0)
            estado = "Esperando acción"

    sincronizar_firebase(nivel_alcohol, valor_pot, potencia, estado, consumo_total, tiempo_succionando)
    time.sleep(0.1)
