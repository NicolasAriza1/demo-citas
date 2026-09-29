# Demo Cliente-Servidor: Reserva de Citas

**Arquitectura de Sistemas I · 2026-2 · Semana 7**

Este proyecto demuestra el estilo arquitectónico **Cliente-Servidor** con tres piezas que viven en lugares físicamente distintos y se comunican por la red:

```
[ Cliente web ]  --HTTP-->  [ Servidor Express ]  --SQL/SSL-->  [ Postgres ]
 (su navegador,              (Render, la nube)                  (Supabase)
  su celular)
```

| Pieza | Qué es | Dónde vive | Archivo |
|---|---|---|---|
| Cliente | Página web que muestra datos y envía peticiones. No tiene reglas ni base de datos. | El navegador de cada persona | `public/index.html` |
| Servidor | Programa que recibe peticiones, aplica las reglas de negocio y consulta la base de datos. | Render (nube) | `server.js` |
| Base de datos | Donde se guardan las citas. Solo el servidor puede hablarle. | Supabase (nube) | `db/setup.sql` |

---

## ¿Qué son estas herramientas? (para quien nunca las ha usado)

- **Node.js** es un programa que permite ejecutar JavaScript fuera del navegador. Con él corremos nuestro servidor. **Express** es una librería de Node que facilita crear servidores web: definir rutas como `GET /api/citas` y responder JSON.
- **Supabase** es un servicio en la nube que nos regala una base de datos **PostgreSQL** lista para usar, sin instalar nada. Nos da una "cadena de conexión" (una URL con usuario y contraseña) que el servidor usa para conectarse.
- **Render** es un servicio que toma nuestro código desde GitHub y lo mantiene ejecutándose en internet con una URL pública. Cada vez que subimos cambios a GitHub, Render vuelve a desplegar solo.
- **GitHub** es donde guardamos el código; Render lo lee desde ahí.

Todo se hace con los **planes gratuitos**. No se necesita tarjeta de crédito.

---

## Requisitos previos

1. Una cuenta en [github.com](https://github.com) (gratis).
2. Una cuenta en [supabase.com](https://supabase.com) (gratis; puede entrar con su cuenta de GitHub).
3. Una cuenta en [render.com](https://render.com) (gratis; puede entrar con su cuenta de GitHub).
4. *(Solo si quiere probar en su computador antes de la nube)* [Node.js](https://nodejs.org) versión 18 o superior instalado.

---

## Paso 1 — Crear la base de datos en Supabase (10 min)

1. Entre a [supabase.com](https://supabase.com) e inicie sesión.
2. Clic en **New project**. Póngale nombre (ej: `demo-citas`), invente una **contraseña de base de datos** usando **solo letras y números** (sin `@`, `#`, `:`, `/` ni otros símbolos: más adelante la contraseña irá dentro de una URL y los símbolos la rompen) y **guárdela en un lugar seguro** (la necesitará en el Paso 3). Región: la más cercana (ej: *South America (São Paulo)*). Clic en **Create new project** y espere ~2 minutos.
3. En el menú lateral izquierdo, abra **SQL Editor**.
4. Abra el archivo `db/setup.sql` de este proyecto (con el Bloc de notas o VS Code), copie **todo** su contenido, péguelo en el editor y presione **Run**. Si aparece una advertencia de "destructive operation" (operación destructiva), confirme con **Run this query**: es normal, porque el script borra las tablas si ya existían antes de crearlas de nuevo. Abajo debe aparecer una tabla con 2 citas de ejemplo. La base de datos quedó lista.
5. Ahora copie la **cadena de conexión**: presione el botón **Connect** (arriba, en la barra del proyecto). En la ventana que aparece, busque la sección **Transaction pooler** y copie la URI, que se ve así:

   ```
   postgresql://postgres.abcdefghijk:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```

   *(La parte `aws-0-sa-east-1` puede ser distinta en su caso según la región que eligió: copie **su** cadena tal cual, sin "corregirla" para que se parezca al ejemplo.)*

6. En esa cadena, reemplace `[YOUR-PASSWORD]` por la contraseña que inventó en el punto 2 (sin corchetes). Guarde la cadena completa en un bloc de notas: es el "secreto" que le daremos al servidor.

> ⚠️ **Importante:** use la cadena del **Transaction pooler** (puerto 6543), no la "Direct connection". La conexión directa usa IPv6 y falla desde Render en el plan gratuito.

---

## Paso 2 — Subir el código a GitHub (10 min)

1. En [github.com](https://github.com), clic en **New repository**. Nombre: `demo-cliente-servidor`. Déjelo **Public** y clic en **Create repository**.
2. Suba los archivos del proyecto (sin instalar nada, desde el navegador). Según cómo haya quedado su repositorio, verá una de dos pantallas:
   - **Repositorio vacío** (no marcó ninguna casilla al crearlo): use el enlace azul **uploading an existing file**.
   - **Repositorio con un README inicial** (marcó "Add a README"): use el botón **Add file → Upload files**.

   En cualquiera de las dos, **arrastre** las carpetas y archivos del proyecto (`server.js`, `package.json`, `package-lock.json`, `public/`, `db/`, `.gitignore`, este `README.md`) al área de carga — los navegadores modernos aceptan arrastrar carpetas completas — y clic en **Commit changes**.
   - **No suba** el archivo `.env` si lo llegó a crear: contiene su contraseña. (El `.gitignore` lo excluye automáticamente si usa git desde la terminal.)
   - **No suba** la carpeta `node_modules` si probó el proyecto localmente: son miles de archivos de librerías que Render reinstala solo con `npm install`.
   - Nota: `.gitignore` y `.env` empiezan por punto y su explorador de archivos puede ocultarlos; si el `.gitignore` no se deja arrastrar, no pasa nada mientras no suba `.env` ni `node_modules` a mano.

---

## Paso 3 — Desplegar el servidor en Render (15 min)

1. Entre a [render.com](https://render.com) e inicie sesión con GitHub.
2. Clic en **New +** → **Web Service**.
3. Autorice a Render a ver sus repositorios y seleccione `demo-cliente-servidor`.
4. Complete el formulario:
   - **Name:** `demo-citas` (esto define la URL final).
   - **Region:** la más cercana (ej: Oregon u Ohio; cualquiera sirve).
   - **Branch:** `main`.
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** **Free**.
5. Antes de crear, baje hasta **Environment Variables** y agregue una variable:
   - **Key:** `DATABASE_URL`
   - **Value:** la cadena de conexión completa del Paso 1 (con su contraseña ya puesta).
6. Clic en **Deploy Web Service**. Render descargará el código, ejecutará `npm install` y arrancará el servidor. En el registro (logs) debe aparecer al final: `Servidor escuchando en el puerto 10000`.
7. Arriba verá la URL pública, algo como `https://demo-citas.onrender.com`. **Ábrala**: debe aparecer la página de Reserva de Citas con las 2 citas de ejemplo. 🎉

Esa URL es la que compartirá con los estudiantes: cualquier persona, desde cualquier dispositivo, es un **cliente** más del mismo **servidor**.

---

## (Opcional) Probar en su computador antes de la nube

Primero, abra una **terminal ubicada en la carpeta del proyecto**:

- **Windows:** abra la carpeta en el Explorador, haga clic en la barra de dirección, escriba `cmd` y presione Enter (o clic derecho dentro de la carpeta → *Abrir en Terminal*).
- **Mac:** clic derecho sobre la carpeta → *Nuevo terminal en la carpeta* (o arrastre la carpeta al ícono de Terminal).

Verifique que Node quedó instalado escribiendo `node -v` (debe responder `v18` o superior). Luego ejecute, una línea a la vez:

```bash
npm install                 # descarga las librerías (express, pg, cors, dotenv)
cp .env.example .env        # cree su archivo de secretos
# edite .env con el Bloc de notas o VS Code (es un archivo oculto: ábralo desde el editor) y pegue su DATABASE_URL real
npm start                   # arranca el servidor
```

Luego abra `http://localhost:3000` en el navegador. Es exactamente el mismo sistema, pero con el servidor corriendo en su máquina en lugar de Render (la base de datos sigue siendo la de Supabase: ya hay comunicación por red).

---

## Solución de problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| La página tarda 30–60 segundos en abrir la primera vez | Plan gratuito de Render: el servicio se apaga tras ~15 min sin tráfico y arranca "en frío" | Abrir la URL 10 minutos antes de la clase. (¡O usarlo como momento pedagógico!) |
| Error `No se pudo consultar la base de datos` | La `DATABASE_URL` está mal (contraseña, o se usó la conexión directa en vez del pooler) | Verificar la variable en Render → *Environment* y usar la URI del **Transaction pooler** |
| Supabase dice que el proyecto está "paused" | Plan gratuito: los proyectos se pausan tras 7 días sin actividad | Entrar al panel de Supabase y presionar **Restore project** (tarda ~2 min). Hacerlo 1–2 días antes de la clase |
| `npm: command not found` al probar localmente | Node.js no está instalado | Instalar Node desde nodejs.org (versión LTS) |
| Error de conexión aunque la cadena "se ve bien" | La contraseña contiene símbolos (`@`, `#`, `:`...) que rompen la URL | Restablecerla solo con letras y números: Supabase → *Project Settings* → *Database* → **Reset database password**, y actualizar `DATABASE_URL` en Render |
| Olvidó la contraseña de la base de datos | Supabase no la muestra nunca | Mismo camino: *Project Settings* → *Database* → **Reset database password** (no borra los datos) |
| Cambié el código pero la URL muestra lo viejo | Render despliega desde GitHub | Subir los cambios a GitHub; Render redespliega solo (ver pestaña *Events*) |

---

## Mapa del código ↔ conceptos de la clase

| Concepto (lectura de Cliente-Servidor) | Dónde verlo en este proyecto |
|---|---|
| Proveedor y consumidor | `server.js` (proveedor) y `public/index.html` (consumidor) |
| El cliente solo representa datos y detona acciones | `index.html`: solo `fetch()` + pintar tablas; cero reglas |
| Centralización de datos y lógica | Las 3 reglas de negocio viven en `POST /api/citas` del servidor |
| Comunicación por red y protocolos | HTTP entre cliente y servidor; SQL sobre SSL entre servidor y Supabase |
| Múltiples clientes, un servidor | Todos los celulares del curso contra la misma URL |
| "Todo o nada" | Suspender el servicio en Render y recargar el cliente |
| Cliente y servidor con tecnologías distintas | HTML/JS del navegador vs Node en el servidor vs Postgres |
