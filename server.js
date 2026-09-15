// ============================================================================
// SERVIDOR (el "proveedor" del estilo Cliente-Servidor)
// ----------------------------------------------------------------------------
// Este archivo ES la aplicación servidor. Sus responsabilidades:
//   1. Escuchar peticiones HTTP que llegan por la red desde los clientes.
//   2. Ejecutar la lógica de negocio (las reglas viven AQUÍ, no en el cliente).
//   3. Ser el ÚNICO que habla con la base de datos (centralización).
//   4. Responder al cliente con datos en formato JSON.
//
// El cliente (public/index.html) nunca toca la base de datos: solo pide.
// ============================================================================

// --- Importar librerías -----------------------------------------------------
// "require" carga módulos instalados con `npm install` (quedan en node_modules/)
const express = require('express'); // framework para crear el servidor HTTP
const cors = require('cors');       // permite que clientes de otros orígenes nos llamen
const { Pool } = require('pg');     // driver para conectarnos a Postgres (Supabase)
const path = require('path');       // para construir rutas de archivos de forma segura
require('dotenv').config();         // lee el archivo .env (solo en desarrollo local)

// --- Conexión a la base de datos (Supabase) ---------------------------------
// La cadena de conexión NO se escribe en el código: viene de una "variable de
// entorno" llamada DATABASE_URL. Localmente sale del archivo .env; en Render
// se configura en el panel del servicio. Así el secreto nunca se sube a GitHub.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase exige conexión cifrada (SSL)
});

// --- Crear la aplicación web ------------------------------------------------
const app = express();
app.use(cors());            // habilita CORS: el cliente puede vivir en otro dominio
app.use(express.json());    // permite leer el JSON que envían los clientes en POST
// sirve el cliente web y resuelve /nombre como /nombre.html automáticamente
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] })); 

// ============================================================================
// ENDPOINTS: las "operaciones" que el servidor expone a los clientes.
// Cada endpoint = un verbo HTTP (GET, POST...) + una ruta (/api/...).
// ============================================================================

// --- GET /api/salud ---------------------------------------------------------
// Endpoint mínimo para verificar que el servidor está vivo.
// Útil en la demo: es la primera URL que abrimos para "despertar" a Render.
app.get('/api/salud', (req, res) => {
  res.json({ estado: 'ok', servidor: 'activo', hora: new Date().toISOString() });
});

// --- GET /api/citas ---------------------------------------------------------
// Devuelve TODAS las citas. Cualquier cliente que pregunte recibe lo mismo,
// porque el servidor es la única fuente de la verdad (centralización).
app.get('/api/citas', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.id, c.paciente, c.fecha_hora, p.nombre AS profesional
         FROM citas c
         JOIN profesionales p ON p.id = c.profesional_id
        ORDER BY c.fecha_hora`
    );
    res.json(resultado.rows); // el servidor responde con JSON
  } catch (error) {
    console.error('Error consultando citas:', error.message);
    res.status(500).json({ error: 'No se pudo consultar la base de datos' });
  }
});

// --- GET /api/profesionales -------------------------------------------------
// Lista de profesionales para llenar el menú desplegable del cliente.
app.get('/api/profesionales', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id, nombre, especialidad FROM profesionales ORDER BY nombre'
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error consultando profesionales:', error.message);
    res.status(500).json({ error: 'No se pudo consultar la base de datos' });
  }
});

// --- POST /api/citas --------------------------------------------------------
// Crea una cita. AQUÍ se ve la centralización de la lógica: aunque el cliente
// intente hacer trampa (por ejemplo enviando una fecha pasada con la consola
// del navegador), el SERVIDOR aplica las reglas y rechaza la petición.
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
    const ocupado = await pool.query(
      'SELECT id FROM citas WHERE profesional_id = $1 AND fecha_hora = $2',
      [profesional_id, fecha_hora]
    );
    if (ocupado.rows.length > 0) {
      return res.status(409).json({ error: 'Regla del servidor: ese profesional ya tiene una cita a esa hora' });
    }

    // Si todas las reglas pasan, se guarda en la base de datos.
    const insercion = await pool.query(
      `INSERT INTO citas (paciente, profesional_id, fecha_hora)
       VALUES ($1, $2, $3) RETURNING id`,
      [paciente, profesional_id, fecha_hora]
    );
    res.status(201).json({ mensaje: 'Cita creada', id: insercion.rows[0].id });
  } catch (error) {
    console.error('Error creando cita:', error.message);
    res.status(500).json({ error: 'No se pudo guardar en la base de datos' });
  }
});

// --- Encender el servidor ---------------------------------------------------
// Render asigna el puerto en la variable PORT; localmente usamos 3000.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  console.log(`Cliente web: http://localhost:${PORT}`);
});
