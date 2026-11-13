# Secretito

Tu sitio personal de contenido: perfil, contenido bloqueado, suscripción mensual, compras individuales,
pago por **transferencia** (con comprobante que apruebas tú) y por **cripto** (se activa solo).

## 1. Probarlo ahora (modo demo)

No necesitas instalar nada. En PowerShell, dentro de esta carpeta:

```bash
powershell -ExecutionPolicy Bypass -File servidor.ps1
```

Abre http://localhost:5500

- En el modo demo todo se guarda solo en tu navegador.
- Crea una cuenta cualquiera para ser fan.
- Crea una cuenta cuyo correo empiece con `admin` (ej: `admin@lo-que-sea.cl`) para ver el **Panel**.

## 2. Personalizarlo

Edita `js/config.js`: nombre, bio, redes, datos de tu cuenta bancaria y fotos de perfil
(pon las imágenes en una carpeta `img/` y escribe por ejemplo `avatar: "img/yo.jpg"`).

Los precios se cambian desde el Panel → Precios.

## 3. Pasarlo a real (Supabase)

1. Crea un proyecto gratis en https://supabase.com (región São Paulo).
2. En **SQL Editor**, pega y ejecuta todo `supabase/esquema.sql`.
3. En **Project Settings → API** copia la *Project URL* y la *anon/publishable key* en `js/config.js`
   (`supabaseUrl` y `supabaseKey`). Esas dos son públicas, no hay problema en que estén en el código.
4. En **Authentication → URL Configuration** pon la dirección de tu sitio como *Site URL*.
5. Entra al sitio, crea tu cuenta y en el SQL Editor ejecuta:
   ```sql
   update public.perfiles set es_admin = true where email = 'tu@correo.cl';
   ```

## 4. Activar cripto (NOWPayments)

1. Crea una cuenta en https://nowpayments.io y pon la dirección de tu billetera
   (recomendado: USDT en red TRON o Polygon).
2. Saca la **API key** y el **IPN secret** (Settings → Payments).
3. Sube las dos funciones de `supabase/functions/` a tu proyecto de Supabase
   (`pago-cripto` con verificación JWT, `nowpayments-ipn` **sin** verificación JWT).
4. En Supabase → Edge Functions → Secrets agrega:
   - `NOWPAYMENTS_API_KEY`
   - `NOWPAYMENTS_IPN_SECRET`
   - `SITIO_URL` (ej: `https://secretito.cl`)
5. En `js/config.js` pon `cripto: true`.

El precio se cobra en dólares usando el valor del dólar del día (mindicador.cl).
Ojo: cada moneda tiene un monto mínimo en NOWPayments; precios muy bajos pueden no alcanzarlo.

## 5. Publicarlo en internet

Es un sitio estático (solo archivos), así que sirve cualquier hosting de archivos. Antes de elegir,
revisa que sus condiciones **permitan contenido para adultos**, igual que con Supabase
(tus fotos y videos quedan guardados ahí). Si alguno no lo permite, se puede cambiar el
almacenamiento a uno que sí (por ejemplo Bunny.net).

## Cómo está protegido el contenido

- Las fotos y videos están en un almacenamiento **privado**. Solo se generan enlaces temporales (1 hora)
  para quien pagó; la base de datos lo verifica, no el navegador.
- Quien no tiene acceso solo recibe una miniatura de 40 px difuminada.
- Los precios los pone la base de datos: nadie puede pagar menos modificando la página.
- Solo tú (admin) puedes aprobar pagos, subir o borrar contenido.
- Nada impide del todo que alguien que pagó saque una captura de pantalla. Eso pasa en todas las plataformas.
