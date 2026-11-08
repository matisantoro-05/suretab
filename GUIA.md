# SureTab: guía de la semana 2 (probar y publicar)

## 1. Probala en tu Chrome (10 minutos)

1. Descomprimí `suretab-source.zip`.
2. Abrí `chrome://extensions`, activá **Modo de desarrollador** (arriba a la derecha) → **Cargar descomprimida** → elegí la carpeta `suretab`.
3. Fijá el ícono en la barra (el ícono del rompecabezas → el pin).

### Checklist de prueba
- [ ] Abrí 5–6 pestañas → ícono → **Guardar las pestañas de esta ventana**. Se cierran y aparece la lista.
- [ ] Clic derecho en una página → menú de SureTab → **Guardar esta pestaña**.
- [ ] `Alt+Shift+S` guarda la ventana.
- [ ] **Abrir todas**: las pestañas se abren sin cargar y cargan al hacer clic en cada una.
- [ ] Borrar un grupo → **Deshacer**. Borrar otro → **Papelera** → Recuperar.
- [ ] Renombrar un grupo y fijarlo arriba (estrella).
- [ ] **Importar**: si tenés OneTab, en OneTab usá “Export URLs”, copiá el texto y pegalo.
- [ ] **Exportar** → descargar backup → importarlo de nuevo.
- [ ] Mirá tus marcadores: tiene que existir la carpeta **SureTab backup**.
- [ ] **Prueba de pérdida de datos**: en `chrome://extensions`, en la tarjeta de SureTab hacé clic en “service worker” → en la consola escribí `chrome.storage.local.clear()` → abrí la lista de nuevo. Tiene que aparecer el aviso “Encontramos un backup” → **Recuperar mis pestañas**.

Si algo falla, copiá el error (en `chrome://extensions` aparece un botón **Errores**) y pasámelo.

## 2. Antes de publicar

- **Nombre**: verificá en la Chrome Web Store que “SureTab” no esté usado. Si está, cambialo en `_locales/en/messages.json` y `_locales/es/messages.json` (`extName`) y en el `short_name` del manifest.
- **Política de privacidad**: subí el repo a GitHub (público, sirve de portfolio), poné tu email en `PRIVACY.md` y usá el link de ese archivo como URL de la política.
- **Capturas**: la tienda pide al menos 1 captura de **1280×800** (o 640×400). Hacé 3: la lista con varios grupos, el aviso de recuperación y el diálogo de Importar. Opcional: una imagen promocional chica de 440×280.
- **Ícono de la tienda**: `icons/icon128.png`.

## 3. Publicar

1. Entrá al **Developer Dashboard** de la Chrome Web Store con tu cuenta de Google y pagá la inscripción (es un pago único; históricamente fueron USD 5).
2. **Add new item** → subí `suretab-store.zip` (es la extensión sin archivos de desarrollo).
3. Completá la ficha copiando todo de `STORE_LISTING.md`: descripción, categoría, propósito único y la justificación de cada permiso. En “privacidad” declarás que no recolectás datos.
4. Enviá a revisión. Suele tardar entre unos días y un par de semanas; las que piden permisos como `tabs` a veces tardan más.

## 4. Qué medir (semanas 3 y 4)

En el dashboard → **Analytics** mirás instalaciones y **usuarios activos semanales**.
- Meta del ciclo: **100 usuarios activos semanales** al final de la semana 4.
- Respondé todas las reseñas: los primeros usuarios te dicen qué falta.
- Si hay uso, en la semana 4 sumamos lo pago con Lemon Squeezy (por ejemplo, backup en Google Drive y sincronización entre equipos, pago único).

## 5. Cómo conseguir los primeros usuarios sin hacer contenido
- La ficha optimizada (título y descripción con “OneTab alternative”, “tab saver”, “never lose tabs”) es el canal principal.
- Cuando alguien pregunte en Reddit (r/chrome, r/productivity) o en foros por una alternativa a OneTab o Toby, respondé con el link. Es una respuesta puntual, no crear contenido.
- Publicala también en la tienda de complementos de Microsoft Edge (es gratis y usa el mismo zip).
