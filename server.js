// ============================================================================
// SERVIDOR (el "proveedor" del estilo Cliente-Servidor) — VERSIÓN 2.0
// ----------------------------------------------------------------------------
// Este archivo ES la aplicación servidor. Sus responsabilidades:
//   1. Escuchar peticiones HTTP que llegan por la red desde los clientes.
//   2. Ejecutar la lógica de negocio (las reglas viven AQUÍ, no en el cliente).
//   3. Ser el ÚNICO que habla con la base de datos (centralización).
//   4. Responder al cliente con datos en formato JSON.
//
// NOVEDADES v2.0 (latencia):
//   - Caché en memoria para las consultas de lectura (GET).
//   - Precarga ("calentamiento") de la caché al encender el servidor.
//   - Conexiones a Supabase que se mantienen vivas (keepAlive).
//   - Encabezado X-Cache: HIT / MISS para ver de dónde salió cada respuesta.
//
// El cliente (public/index.html) nunca toca la base de datos: solo pide.
// ============================================================================

const VERSION = '2.0';

// --- Importar librerías -----------------------------------------------------
const express = require('express'); // framework para crear el servidor HTTP
const cors = require('cors');       // permite que clientes de otros orígenes nos llamen
const { Pool } = require('pg');     // driver para conectarnos a Postgres (Supabase)
const path = require('path');       // para construir rutas de archivos de forma segura
require('dotenv').config();         // lee el archivo .env (solo en desarrollo local)

// --- Conexión a la base de datos (Supabase) ---------------------------------
// La cadena de conexión viene de la variable de entorno DATABASE_URL.
// keepAlive mantiene abiertas las conexiones TCP/SSL con Supabase, para no
// repetir el "saludo" de conexión cifrada en cada consulta.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase exige conexión cifrada (SSL)
  keepAlive: true,
});

// --- Crear la aplicación web ------------------------------------------------
const app = express();
// exposedHeaders permite que el navegador lea X-Cache aunque el cliente
// esté abierto desde otro origen (por ejemplo, con doble clic en el archivo).
app.use(cors({ exposedHeaders: ['X-Cache'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ============================================================================
// CACHÉ EN MEMORIA
// ----------------------------------------------------------------------------
// Cada consulta a Supabase es un viaje por la red (Render → Supabase → Render).
// Si los datos no han cambiado, no tiene sentido repetir ese viaje: guardamos
// la última respuesta en la RAM del servidor y la reutilizamos.
//   - Se INVALIDA (se borra) cuando se crea una cita, para no servir datos viejos.
//   - Además caduca sola cada 30 s, por si alguien edita datos directamente
//     desde el panel de Supabase.
// ============================================================================
const TTL_MS = 30_000;
const cache = new Map(); // clave → { datos, expira }

const SQL = {
  citas: `SELECT c.id, c.paciente, c.fecha_hora, p.nombre AS profesional
            FROM citas c
            JOIN profesionales p ON p.id = c.profesional_id
           ORDER BY c.fecha_hora`,
  profesionales: 'SELECT id, nombre, especialidad FROM profesionales ORDER BY nombre',
};

// Devuelve los datos desde la caché si están vigentes; si no, consulta Supabase.
async function obtener(clave) {
  const guardado = cache.get(clave);
  if (guardado && guardado.expira > Date.now()) {
    return { datos: guardado.datos, hit: true };
  }
  const resultado = await pool.query(SQL[clave]);
  cache.set(clave, { datos: resultado.rows, expira: Date.now() + TTL_MS });
  return { datos: resultado.rows, hit: false };
}

// ============================================================================
// ENDPOINTS
// ============================================================================

// --- GET /api/salud ---------------------------------------------------------
// Ahora también informa la versión: así el cliente sabe con qué servidor habla.
app.get('/api/salud', (req, res) => {
  res.json({ estado: 'ok', servidor: 'activo', version: VERSION, cache: true,
             hora: new Date().toISOString() });
});

// --- GET /api/citas ---------------------------------------------------------
app.get('/api/citas', async (req, res) => {
  try {
    const { datos, hit } = await obtener('citas');
    res.set('X-Cache', hit ? 'HIT' : 'MISS').json(datos);
  } catch (error) {
    console.error('Error consultando citas:', error.message);
    res.status(500).json({ error: 'No se pudo consultar la base de datos' });
  }
});

// --- GET /api/profesionales -------------------------------------------------
app.get('/api/profesionales', async (req, res) => {
  try {
    const { datos, hit } = await obtener('profesionales');
    res.set('X-Cache', hit ? 'HIT' : 'MISS').json(datos);
  } catch (error) {
    console.error('Error consultando profesionales:', error.message);
    res.status(500).json({ error: 'No se pudo consultar la base de datos' });
  }
});

// --- POST /api/citas --------------------------------------------------------
app.post('/api/citas', async (req, res) => {
  const { paciente, profesional_id, fecha_hora } = req.body;

  // Regla 1: los tres datos son obligatorios.
  if (!paciente || !profesional_id || !fecha_hora) {
    return res.status(400).json({ error: 'Faltan datos: paciente, profesional y fecha son obligatorios' });
  }

  // Regla 2: la fecha debe ser válida y no puede estar en el pasado.
  const fecha = new Date(fecha_hora);
  if (isNaN(fecha.getTime())) {
    return res.status(400).json({ error: 'Regla del servidor: la fecha enviada no es válida' });
  }
  if (fecha <= new Date()) {
    return res.status(400).json({ error: 'Regla del servidor: no se pueden reservar citas en el pasado' });
  }

  try {
    // Regla 3: el profesional no puede tener dos citas a la misma hora.
    // La garantiza el índice único idx_cita_unica: un solo viaje a la BD.
    const insercion = await pool.query(
      `INSERT INTO citas (paciente, profesional_id, fecha_hora)
       VALUES ($1, $2, $3) RETURNING id`,
      [paciente, profesional_id, fecha_hora]
    );
    cache.delete('citas'); // la lista cambió: la próxima consulta irá a Supabase
    res.status(201).json({ mensaje: 'Cita creada', id: insercion.rows[0].id });
  } catch (error) {
    if (error.code === '23505') { // unique_violation: horario ocupado
      return res.status(409).json({ error: 'Regla del servidor: ese profesional ya tiene una cita a esa hora' });
    }
    if (error.code === '23503') { // foreign_key_violation: profesional inexistente
      return res.status(400).json({ error: 'Regla del servidor: el profesional indicado no existe' });
    }
    console.error('Error creando cita:', error.message);
    res.status(500).json({ error: 'No se pudo guardar en la base de datos' });
  }
});

// --- Encender el servidor ---------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor v${VERSION} escuchando en el puerto ${PORT}`);
  console.log(`Cliente web: http://localhost:${PORT}`);

  // Calentamiento: abre la conexión con Supabase y llena la caché de una vez,
  // para que el primer cliente no pague el costo del viaje a la base de datos.
  try {
    await Promise.all([obtener('citas'), obtener('profesionales')]);
    console.log('Caché precargada');
  } catch (error) {
    console.error('No se pudo precargar la caché:', error.message);
  }
});
