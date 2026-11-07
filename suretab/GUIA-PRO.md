# SureTab Pro: guía para dejarlo funcionando (versión 0.2.0)

La versión Pro tiene dos partes:

| Parte | Estado | Qué falta |
|---|---|---|
| **Licencias (Lemon Squeezy)** | ✅ Programado y configurado con tu tienda (Store ID 517981, Product ID 1508709) | Una compra de prueba (paso 3) |
| **Backup en Google Drive** | ✅ Programado | Crear el "Client ID" de Google (paso 2) y pasármelo |

Mientras no esté el Client ID, la sección de Drive muestra "disponible muy pronto" y nada se rompe.

---

## 1. Cómo funciona por dentro (para que sepas qué estás vendiendo)

- **Activar Pro:** el usuario pega la clave → SureTab pide permiso para conectarse con `api.lemonsqueezy.com` → activa la clave en esa computadora (máximo 3) → comprueba que la clave sea de **tu tienda y tu producto**. Sin servidor propio.
- **Revisión diaria:** una vez por día (y al abrir la ventana ⭐ Pro, si pasó más de una hora) SureTab revisa que la licencia siga válida. Si no hay internet, **no le saca Pro a nadie**. Si desactivaste la clave en Lemon Squeezy (por ejemplo, después de un reembolso), se apaga. **Regla: cada vez que hagas un reembolso, desactivá la clave en Store → Licenses → ⋯ → Disable key.**
- **Backup en Drive:** el usuario toca "Conectar Google Drive" → elige su cuenta de Google → SureTab crea una carpeta **SureTab** en *su* Drive. Cada vez que cambia la lista (1 minuto después), sube:
  - `suretab-backup.json` (siempre la última versión)
  - `suretab-backup-AAAA-MM-DD.json` (una copia por día, se guardan 30 días)
- **Permiso mínimo:** se usa `drive.file`, con el que SureTab **solo puede ver los archivos que crea**, no el resto del Drive. Por eso Google no exige una verificación de seguridad paga.
- **En otra computadora:** instala SureTab, activa su clave, toca "Recuperar desde Drive" y elige una copia. Lo recuperado **se suma**, no borra nada.

---

## 2. Crear el Client ID de Google (20–30 minutos, gratis)

Es lo que le permite a SureTab pedirle a Google acceso al Drive del usuario.

### 2.1 Proyecto y API
1. Entrá a **console.cloud.google.com** con tu cuenta de Google.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre: `SureTab` → **Crear**. Asegurate de que quede seleccionado.
3. Menú ☰ → **APIs y servicios** → **Biblioteca** → buscá **Google Drive API** → **Habilitar**.

### 2.2 Pantalla de consentimiento (lo que ve el usuario al conectar)
Menú ☰ → **APIs y servicios** → **Pantalla de consentimiento de OAuth** (en algunas cuentas se llama **Google Auth Platform**). Tocá **Comenzar** si aparece.
- **Nombre de la app:** `SureTab`
- **Correo de asistencia:** tu email de contacto de la extensión
- **Público / Audiencia:** **Externo**
- **Información de contacto:** tu email
- Aceptá la política y **Crear**.

Después:
- **Branding / Marca:** logo opcional (`icons/icon128.png`). En **Página principal** poné el link del repo de GitHub y en **Política de privacidad** el link a `PRIVACY.md` en GitHub.
- **Acceso a los datos (Data access) → Agregar o quitar permisos:** buscá y marcá **`.../auth/drive.file`** ("Ver, editar, crear y borrar solo los archivos específicos de Google Drive que usas con esta app") → **Actualizar** → **Guardar**.
- **Público (Audience):** tocá **Publicar app** → confirmar. ⚠️ Importante: si queda en "Prueba", solo funciona para los usuarios de prueba que agregues y la conexión se corta cada 7 días.

> Como `drive.file` no es un permiso "sensible", publicar no requiere la verificación larga de Google. Puede que Google te pida verificar la marca (nombre y logo) más adelante; mientras tanto la conexión funciona.

### 2.3 El cliente
Menú ☰ → **APIs y servicios** → **Credenciales** (o **Clientes**) → **Crear credenciales** → **ID de cliente de OAuth**:
- **Tipo de aplicación:** **Aplicación web** (sí, web, aunque sea una extensión).
- **Nombre:** `SureTab extension`
- **URI de redireccionamiento autorizados** → agregá **estas dos**:
  - `https://apohnmmpeoppgmldpjkedfobohofihnn.chromiumapp.org/` ← la versión publicada
  - `https://ID-DE-TU-VERSION-LOCAL.chromiumapp.org/` ← la que cargás con "Cargar descomprimida". El ID lo ves en `chrome://extensions`, en la tarjeta de SureTab (32 letras). Así podés probar Drive antes de publicar.
  - Ojo: con `https://` al principio y la `/` al final.
- **Crear** → copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`) y **pasámelo**. El "secreto del cliente" no hace falta.

---

## 3. Compra de prueba (10 minutos, no se cobra nada)

Con la tienda de Lemon Squeezy todavía en modo de prueba:

1. Cargá la versión 0.2.0 descomprimida en tu Chrome (`chrome://extensions` → Cargar descomprimida).
2. Abrí la lista → botón **⭐ Pro** → **Comprar Pro – $9.99**.
3. En la página de pago usá la tarjeta de prueba **4242 4242 4242 4242**, cualquier fecha futura y cualquier código de 3 dígitos.
4. Copiá la clave de licencia que te muestra (también llega por email).
5. Volvé a SureTab → **⭐ Pro** → pegá la clave → **Activar**. Chrome te pide permiso para conectarse con Lemon Squeezy → **Permitir**.
6. Tiene que aparecer "✓ SureTab Pro está activo en esta computadora".

Pruebas extra:
- Clave inventada → tiene que decir "Esa clave no es válida".
- **Desactivar Pro en esta computadora** → vuelve al estado sin Pro, y en Lemon Squeezy → Licenses la activación desaparece.

Si algo falla, pasame una captura del mensaje.

---

## 4. Antes de publicar la 0.2.0

- [ ] Pasarme el **Client ID** de Google → armo el zip final con Drive funcionando.
- [ ] Probar "Conectar Google Drive" con la versión local y ver la carpeta **SureTab** en tu Drive.
- [ ] **Activar la tienda de Lemon Squeezy** (modo real). Si al pasar a modo real el producto tiene **otro ID o link de compra** (Lemon Squeezy separa los datos de prueba de los reales), pasame los nuevos y los actualizo.
- [ ] Actualizar en la Chrome Web Store, sección **Prácticas de privacidad** (ver abajo).
- [ ] Subir `PRIVACY.md` actualizado a GitHub.

### Prácticas de privacidad: textos para los permisos nuevos
- **alarms:** `Schedules the automatic Google Drive backup a minute after the saved list changes, and a weekly license check for SureTab Pro.`
- **identity** (opcional): `Lets SureTab Pro users sign in with Google to back up their saved tabs to their own Google Drive. Only requested when the user clicks "Connect Google Drive".`
- **Permisos de host (api.lemonsqueezy.com, www.googleapis.com, opcionales):** `api.lemonsqueezy.com is used to activate and check the SureTab Pro license key. www.googleapis.com is used to save the user's backup file to their own Google Drive. Both are requested only when the user uses those Pro features.`
- **Uso de datos:** marcá **"Historial web"** (las URLs guardadas se suben al Google Drive *del propio usuario* cuando él activa el backup) y aclarar en la política que nunca llegan al desarrollador. Las certificaciones de abajo siguen siendo ciertas: no se venden ni se usan para otra cosa.
