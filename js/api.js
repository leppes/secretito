// Capa de datos: usa Supabase si está configurado, si no un modo demo que guarda todo en el navegador.
import { CONFIG } from "./config.js";

export const modoDemo = !CONFIG.supabaseUrl || !CONFIG.supabaseKey;
export const api = modoDemo ? crearDemo() : await crearSupabase();

const MENSAJES = {
  "Invalid login credentials": "Correo o contraseña incorrectos",
  "User already registered": "Ese correo ya tiene una cuenta",
  "Email not confirmed": "Primero confirma tu correo (revisa tu bandeja)",
  "Password should be at least 6 characters.": "La contraseña debe tener al menos 6 caracteres",
};
const traducir = (m) => MENSAJES[m] ?? m;

function extension(nombre) {
  const e = nombre.split(".").pop().toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(e) ? e : "bin";
}

// ---------------------------------------------------------------- Supabase

async function crearSupabase() {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  const revisar = ({ data, error }) => {
    if (error) throw new Error(traducir(error.message));
    return data;
  };
  let perfil;

  return {
    async sesion() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;
      perfil ??= revisar(await sb.from("perfiles").select("es_admin").eq("id", session.user.id).maybeSingle());
      return { id: session.user.id, email: session.user.email, es_admin: !!perfil?.es_admin };
    },
    async registrar(email, clave) {
      const r = revisar(await sb.auth.signUp({
        email, password: clave,
        options: { emailRedirectTo: new URL("index.html", location.href).href },
      }));
      return { confirmar: !r.session };
    },
    async entrar(email, clave) {
      revisar(await sb.auth.signInWithPassword({ email, password: clave }));
    },
    async salir() {
      await sb.auth.signOut();
    },

    async ajustes() {
      return revisar(await sb.from("ajustes").select("*").eq("id", 1).single());
    },
    async publicaciones() {
      const filas = revisar(await sb.from("publicaciones").select("*").order("creado", { ascending: false }));
      return filas.map((p) => ({ ...p, previaUrl: sb.storage.from("previas").getPublicUrl(p.vista_previa).data.publicUrl }));
    },
    async accesos() {
      const { data, error } = await sb.rpc("estado_acceso");
      return error || !data ? { suscrito_hasta: null, compradas: [] } : data;
    },
    async urlArchivo(pub) {
      return revisar(await sb.storage.from("contenido").createSignedUrl(pub.archivo, 3600)).signedUrl;
    },

    async crearPedido(producto, publicacion) {
      return revisar(await sb.rpc("crear_pedido", {
        p_producto: producto, p_publicacion: publicacion ?? null, p_metodo: "transferencia",
      }));
    },
    async subirComprobante(pedidoId, archivo) {
      const { data: { user } } = await sb.auth.getUser();
      const ruta = `${user.id}/${pedidoId}-${Date.now()}.${extension(archivo.name)}`;
      revisar(await sb.storage.from("comprobantes").upload(ruta, archivo));
      revisar(await sb.rpc("enviar_comprobante", { p_pedido: pedidoId, p_ruta: ruta }));
    },
    async pagarCripto(producto, publicacion) {
      const { data, error } = await sb.functions.invoke("pago-cripto", { body: { producto, publicacion } });
      if (error) {
        const detalle = await error.context?.json?.().catch(() => null);
        throw new Error(detalle?.error ?? "No se pudo crear el pago cripto");
      }
      return data.url;
    },
    async misPedidos() {
      const { data: { user } } = await sb.auth.getUser();
      return revisar(await sb.from("pedidos").select("*, publicaciones(titulo)")
        .eq("usuario", user.id).order("creado", { ascending: false }));
    },

    // Solo admin (la base de datos lo bloquea para los demás)
    async pedidosAdmin() {
      return revisar(await sb.from("pedidos").select("*, perfiles(email), publicaciones(titulo)")
        .order("creado", { ascending: false }).limit(300));
    },
    async urlComprobante(ruta) {
      return revisar(await sb.storage.from("comprobantes").createSignedUrl(ruta, 600)).signedUrl;
    },
    async aprobar(id) {
      revisar(await sb.rpc("aprobar_pedido", { p_pedido: id }));
    },
    async rechazar(id) {
      revisar(await sb.rpc("rechazar_pedido", { p_pedido: id }));
    },
    async crearPublicacion({ titulo, descripcion, tipo, acceso, precio, archivo, previa }) {
      const id = crypto.randomUUID();
      const ruta = `${id}/original.${extension(archivo.name)}`;
      const rutaPrevia = `${id}.jpg`;
      revisar(await sb.storage.from("contenido").upload(ruta, archivo, { contentType: archivo.type }));
      revisar(await sb.storage.from("previas").upload(rutaPrevia, previa, { contentType: "image/jpeg" }));
      revisar(await sb.from("publicaciones").insert({
        id, titulo, descripcion, tipo, acceso,
        precio: acceso === "compra" ? precio : null,
        archivo: ruta, vista_previa: rutaPrevia,
      }));
    },
    async borrarPublicacion(pub) {
      revisar(await sb.from("publicaciones").delete().eq("id", pub.id));
      await sb.storage.from("contenido").remove([pub.archivo]);
      await sb.storage.from("previas").remove([pub.vista_previa]);
    },
    async guardarAjustes({ precio_suscripcion, dias_suscripcion }) {
      revisar(await sb.from("ajustes").update({ precio_suscripcion, dias_suscripcion }).eq("id", 1));
    },
  };
}

// ---------------------------------------------------------------- Demo

function crearDemo() {
  const CLAVE = "secretito_demo_v1";
  let db = cargar();

  function cargar() {
    try {
      const texto = localStorage.getItem(CLAVE);
      if (texto) return JSON.parse(texto);
    } catch {}
    return {
      usuarios: [],
      sesion: null,
      pedidos: [],
      ajustes: { precio_suscripcion: 5990, dias_suscripcion: 30 },
      publicaciones: ejemplos(),
    };
  }
  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(db));
    } catch {}
  }
  const espera = () => new Promise((ok) => setTimeout(ok, 250));
  const yo = () => db.usuarios.find((u) => u.id === db.sesion) ?? null;
  const exigirAdmin = () => {
    if (!yo()?.es_admin) throw new Error("Solo la administradora puede hacer esto");
  };

  function suscritoHasta(uid) {
    const fechas = db.pedidos
      .filter((p) => p.usuario === uid && p.producto === "suscripcion" && p.estado === "pagado")
      .map((p) => p.vigente_hasta);
    return fechas.length ? fechas.sort().at(-1) : null;
  }
  function marcarPagado(pedido) {
    if (pedido.estado === "pagado") return;
    pedido.estado = "pagado";
    pedido.pagado_en = new Date().toISOString();
    if (pedido.producto === "suscripcion") {
      const actual = suscritoHasta(pedido.usuario);
      const desde = Math.max(Date.now(), actual ? Date.parse(actual) : 0);
      pedido.vigente_hasta = new Date(desde + db.ajustes.dias_suscripcion * 864e5).toISOString();
    }
  }
  function nuevoPedido(producto, publicacion, metodo) {
    const u = yo();
    if (!u) throw new Error("Debes iniciar sesión");
    let monto = db.ajustes.precio_suscripcion;
    if (producto === "publicacion") {
      const pub = db.publicaciones.find((p) => p.id === publicacion && p.acceso === "compra");
      if (!pub) throw new Error("Publicación no disponible");
      monto = pub.precio;
    }
    const pedido = {
      id: crypto.randomUUID(), usuario: u.id, producto,
      publicacion: producto === "publicacion" ? publicacion : null,
      monto, metodo, estado: "pendiente", comprobante: null,
      pagado_en: null, vigente_hasta: null, creado: new Date().toISOString(),
    };
    db.pedidos.push(pedido);
    return pedido;
  }
  const conTitulo = (p) => ({
    ...p,
    publicaciones: p.publicacion ? { titulo: db.publicaciones.find((x) => x.id === p.publicacion)?.titulo ?? "(borrada)" } : null,
    perfiles: { email: db.usuarios.find((u) => u.id === p.usuario)?.email },
  });

  return {
    async sesion() {
      const u = yo();
      return u ? { id: u.id, email: u.email, es_admin: u.es_admin } : null;
    },
    async registrar(email, clave) {
      await espera();
      email = email.trim().toLowerCase();
      if (clave.length < 6) throw new Error(MENSAJES["Password should be at least 6 characters."]);
      if (db.usuarios.some((u) => u.email === email)) throw new Error(MENSAJES["User already registered"]);
      const u = { id: crypto.randomUUID(), email, clave, es_admin: email.startsWith("admin") };
      db.usuarios.push(u);
      db.sesion = u.id;
      guardar();
      return { confirmar: false };
    },
    async entrar(email, clave) {
      await espera();
      const u = db.usuarios.find((x) => x.email === email.trim().toLowerCase() && x.clave === clave);
      if (!u) throw new Error(MENSAJES["Invalid login credentials"]);
      db.sesion = u.id;
      guardar();
    },
    async salir() {
      db.sesion = null;
      guardar();
    },

    async ajustes() {
      return { ...db.ajustes };
    },
    async publicaciones() {
      return [...db.publicaciones].sort((a, b) => b.creado.localeCompare(a.creado));
    },
    async accesos() {
      const u = yo();
      if (!u) return { suscrito_hasta: null, compradas: [] };
      return {
        suscrito_hasta: suscritoHasta(u.id),
        compradas: db.pedidos
          .filter((p) => p.usuario === u.id && p.producto === "publicacion" && p.estado === "pagado")
          .map((p) => p.publicacion),
      };
    },
    async urlArchivo(pub) {
      return pub.archivoUrl;
    },

    async crearPedido(producto, publicacion) {
      const p = nuevoPedido(producto, publicacion, "transferencia");
      guardar();
      return p;
    },
    async subirComprobante(pedidoId, archivo) {
      await espera();
      const p = db.pedidos.find((x) => x.id === pedidoId && x.usuario === yo()?.id);
      if (!p) throw new Error("Pedido no válido");
      p.comprobante = archivo.name;
      p.estado = "revision";
      guardar();
    },
    async pagarCripto(producto, publicacion) {
      await espera();
      const p = nuevoPedido(producto, publicacion, "cripto");
      marcarPagado(p); // en el modo demo el pago cripto se confirma al instante
      guardar();
      return "cuenta.html?pago=cripto";
    },
    async misPedidos() {
      const u = yo();
      return db.pedidos.filter((p) => p.usuario === u?.id).reverse().map(conTitulo);
    },

    async pedidosAdmin() {
      exigirAdmin();
      return [...db.pedidos].reverse().map(conTitulo);
    },
    async urlComprobante() {
      return null; // en el modo demo no se guarda la imagen del comprobante
    },
    async aprobar(id) {
      exigirAdmin();
      marcarPagado(db.pedidos.find((p) => p.id === id));
      guardar();
    },
    async rechazar(id) {
      exigirAdmin();
      const p = db.pedidos.find((x) => x.id === id);
      if (p.estado !== "pagado") p.estado = "rechazado";
      guardar();
    },
    async crearPublicacion({ titulo, descripcion, tipo, acceso, precio, archivo, previa }) {
      exigirAdmin();
      const pub = {
        id: crypto.randomUUID(), titulo, descripcion, tipo, acceso,
        precio: acceso === "compra" ? precio : null,
        previaUrl: await comoDataUrl(previa),
        // archivos grandes no caben en el navegador: solo duran hasta recargar la página
        archivoUrl: archivo.size < 1.5e6 ? await comoDataUrl(archivo) : URL.createObjectURL(archivo),
        creado: new Date().toISOString(),
      };
      db.publicaciones.push(pub);
      guardar();
    },
    async borrarPublicacion(pub) {
      exigirAdmin();
      db.publicaciones = db.publicaciones.filter((p) => p.id !== pub.id);
      guardar();
    },
    async guardarAjustes(a) {
      exigirAdmin();
      Object.assign(db.ajustes, a);
      guardar();
    },
  };
}

function comoDataUrl(blob) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = mal;
    r.readAsDataURL(blob);
  });
}

function arte(semilla, nitido) {
  const tonos = [[330, 280], [350, 15], [300, 250], [15, 330], [275, 205], [340, 300]];
  const [a, b] = tonos[semilla % tonos.length];
  const cx = 110 + ((semilla * 53) % 180);
  const cy = 160 + ((semilla * 71) % 180);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${a} 70% 58%)"/><stop offset="1" stop-color="hsl(${b} 55% 22%)"/></linearGradient></defs>
<rect width="400" height="500" fill="url(#g)"/>
<circle cx="${cx}" cy="${cy}" r="${100 + (semilla % 4) * 18}" fill="hsl(${a} 95% 82% / .35)"/>
<circle cx="${400 - cx}" cy="${500 - cy}" r="70" fill="hsl(${b} 90% 70% / .3)"/>
${nitido ? `<text x="200" y="255" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#fff" opacity=".85">Contenido de ejemplo</text>` : ""}
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function ejemplos() {
  const base = [
    ["Bienvenidos a mi rincón 💗", "Gratis para todos: así se ve lo que subo.", "foto", "gratis", null],
    ["Sesión de domingo", "12 fotos nuevas, solo para suscriptores.", "foto", "suscriptores", null],
    ["Detrás de cámaras", "Video corto de la última sesión.", "video", "suscriptores", null],
    ["Pack especial rojo", "Pack de 20 fotos que no está en la suscripción.", "foto", "compra", 4990],
    ["Noche en la playa", "", "foto", "suscriptores", null],
    ["Video exclusivo 10 min", "Mi video más largo hasta ahora.", "video", "compra", 7990],
    ["Lunes de selfies", "", "foto", "suscriptores", null],
    ["Pregúntame lo que quieras", "Video respondiendo sus preguntas.", "video", "gratis", null],
    ["Outfit nuevo", "", "foto", "suscriptores", null],
  ];
  return base.map(([titulo, descripcion, tipo, acceso, precio], i) => ({
    id: `demo-${i}`, titulo, descripcion, tipo, acceso, precio, muestra: true,
    previaUrl: arte(i, false), archivoUrl: arte(i, true),
    creado: new Date(Date.now() - i * 2 * 864e5).toISOString(),
  }));
}
