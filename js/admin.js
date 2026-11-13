import { api, modoDemo } from "./api.js";
import { $, clp, fecha, escapar, montarCabecera, aviso, confirmar, etiquetaEstado, nombreProducto, detener } from "./ui.js";

const usuario = await montarCabecera();
if (!usuario?.es_admin) {
  location.replace(usuario ? "index.html" : "entrar.html?volver=admin.html");
  await detener();
}

let pedidos = [];
let publicaciones = [];

document.querySelectorAll(".pestanas button").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelector(".pestanas .activa").classList.remove("activa");
    boton.classList.add("activa");
    for (const s of ["pagos", "subir", "contenido", "ajustes"]) $("#" + s).hidden = s !== boton.dataset.seccion;
  });
});

// ---------- Pagos

async function cargarPagos() {
  pedidos = await api.pedidosAdmin();
  const pagados = pedidos.filter((p) => p.estado === "pagado");
  const ahora = new Date();
  const suscriptores = new Set(pagados.filter((p) => p.vigente_hasta && new Date(p.vigente_hasta) > ahora).map((p) => p.usuario));
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  $("#cifras").innerHTML = `
    <div class="cifra"><span>Por revisar</span><b>${pedidos.filter((p) => p.estado === "revision").length}</b></div>
    <div class="cifra"><span>Suscriptores activos</span><b>${suscriptores.size}</b></div>
    <div class="cifra"><span>Ingresos del mes</span><b>${clp(pagados.filter((p) => new Date(p.pagado_en) >= inicioMes).reduce((s, p) => s + p.monto, 0))}</b></div>
    <div class="cifra"><span>Ingresos totales</span><b>${clp(pagados.reduce((s, p) => s + p.monto, 0))}</b></div>`;
  pintarPagos();
}

function pintarPagos() {
  const filtro = $("#filtro-pagos").value;
  const lista = pedidos.filter((p) => filtro === "todos" || p.estado === filtro);
  $("#lista-pagos").innerHTML = lista.length
    ? lista.map((p) => `
      <div class="fila">
        <div class="fila-principal">
          <b>${escapar(p.perfiles?.email ?? "—")}</b>
          <span class="suave chico">${escapar(nombreProducto(p))} · ${clp(p.monto)} · ${p.metodo === "cripto" ? "Cripto" : "Transferencia"} · ${fecha(p.creado)}</span>
        </div>
        <div class="fila-acciones">
          ${etiquetaEstado(p.estado)}
          ${p.comprobante ? `<button class="boton boton-secundario boton-chico" data-ver="${p.id}">Comprobante</button>` : ""}
          ${p.estado === "revision" || p.estado === "pendiente" || p.estado === "rechazado"
            ? `<button class="boton boton-chico" data-aprobar="${p.id}">Aprobar</button>` : ""}
          ${p.estado === "revision" ? `<button class="boton boton-peligro boton-chico" data-rechazar="${p.id}">Rechazar</button>` : ""}
        </div>
      </div>`).join("")
    : `<p class="suave">No hay pagos aquí.</p>`;
}

$("#filtro-pagos").addEventListener("change", pintarPagos);

$("#lista-pagos").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.ver) {
      const p = pedidos.find((x) => x.id === b.dataset.ver);
      const url = await api.urlComprobante(p.comprobante);
      if (url) window.open(url, "_blank", "noopener");
      else aviso(modoDemo ? `Modo demo: el fan subió "${p.comprobante}"` : "No se encontró el comprobante", "error");
      return;
    }
    if (b.dataset.aprobar) {
      if (!(await confirmar("¿Confirmas que te llegó este pago? Se le activará el acceso.", "Aprobar"))) return;
      b.disabled = true;
      await api.aprobar(b.dataset.aprobar);
      aviso("Pago aprobado, acceso activado");
    }
    if (b.dataset.rechazar) {
      if (!(await confirmar("¿Rechazar este pago?", "Rechazar"))) return;
      b.disabled = true;
      await api.rechazar(b.dataset.rechazar);
      aviso("Pago rechazado");
    }
    await cargarPagos();
  } catch (err) {
    aviso(err.message, "error");
    b.disabled = false;
  }
});

// ---------- Subir contenido

const form = $("#form-subir");
let previa = null;

form.acceso.addEventListener("change", () => {
  $("#campo-precio").hidden = form.acceso.value !== "compra";
});

form.archivo.addEventListener("change", async () => {
  const archivo = form.archivo.files[0];
  previa = null;
  $("#previa-subida").hidden = true;
  $("#error-subir").textContent = "";
  if (!archivo) return;
  $("#boton-subir").disabled = true;
  try {
    previa = await crearPrevia(archivo);
    $("#previa-img").src = URL.createObjectURL(previa);
    $("#previa-subida").hidden = false;
    if (!form.titulo.value) form.titulo.value = archivo.name.replace(/\.[^.]+$/, "").slice(0, 80);
  } catch {
    $("#error-subir").textContent = "No pude leer ese archivo. Prueba con JPG, PNG o MP4.";
  } finally {
    $("#boton-subir").disabled = false;
  }
});

// Miniatura de 40 px: al agrandarla no se distingue nada, así que es segura para mostrar a cualquiera.
async function crearPrevia(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    let fuente;
    let ancho;
    let alto;
    if (archivo.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;
      await new Promise((ok, mal) => {
        video.onloadeddata = ok;
        video.onerror = mal;
      });
      await new Promise((ok) => {
        video.onseeked = ok;
        video.currentTime = Math.min(1, (video.duration || 2) / 2);
      });
      [fuente, ancho, alto] = [video, video.videoWidth, video.videoHeight];
    } else {
      const img = new Image();
      img.src = url;
      await img.decode();
      [fuente, ancho, alto] = [img, img.naturalWidth, img.naturalHeight];
    }
    const lienzo = document.createElement("canvas");
    lienzo.width = 40;
    lienzo.height = Math.max(1, Math.round((alto / ancho) * 40)) || 50;
    lienzo.getContext("2d").drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
    return await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.7));
  } finally {
    URL.revokeObjectURL(url);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const archivo = form.archivo.files[0];
  const error = $("#error-subir");
  error.textContent = "";
  if (!archivo || !previa) return (error.textContent = "Elige una foto o un video");
  if (!form.titulo.value.trim()) return (error.textContent = "Ponle un título");
  const precio = Number(form.precio.value);
  if (form.acceso.value === "compra" && !(precio >= 500)) return (error.textContent = "El precio mínimo es $500");

  const boton = $("#boton-subir");
  boton.disabled = true;
  boton.textContent = "Subiendo…";
  try {
    await api.crearPublicacion({
      titulo: form.titulo.value.trim(),
      descripcion: form.descripcion.value.trim(),
      tipo: archivo.type.startsWith("video/") ? "video" : "foto",
      acceso: form.acceso.value,
      precio: Math.round(precio),
      archivo,
      previa,
    });
    aviso("¡Publicado!");
    form.reset();
    previa = null;
    $("#previa-subida").hidden = true;
    $("#campo-precio").hidden = true;
    await cargarContenido();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = "Publicar";
  }
});

// ---------- Contenido

const NOMBRE_ACCESO = { gratis: "Gratis", suscriptores: "Suscriptores", compra: "Compra" };

async function cargarContenido() {
  publicaciones = await api.publicaciones();
  $("#lista-contenido").innerHTML = publicaciones.length
    ? publicaciones.map((p) => `
      <div class="fila">
        <div class="fila-con-imagen">
          <img class="miniatura" src="${p.muestra ? p.archivoUrl : p.previaUrl}" alt="">
          <div>
            <b>${escapar(p.titulo)}</b>
            <span class="suave chico">${p.tipo === "video" ? "Video" : "Foto"} · ${NOMBRE_ACCESO[p.acceso]}${p.acceso === "compra" ? " " + clp(p.precio) : ""} · ${fecha(p.creado)}</span>
          </div>
        </div>
        <button class="boton boton-peligro boton-chico" data-borrar="${p.id}">Borrar</button>
      </div>`).join("")
    : `<p class="suave">Aún no subes nada.</p>`;
}

$("#lista-contenido").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-borrar]");
  if (!b) return;
  const p = publicaciones.find((x) => x.id === b.dataset.borrar);
  if (!(await confirmar(`¿Borrar "${p.titulo}"? Quienes la compraron ya no podrán verla.`, "Borrar"))) return;
  try {
    await api.borrarPublicacion(p);
    aviso("Publicación borrada");
    await cargarContenido();
  } catch (err) {
    aviso(err.message, "error");
  }
});

// ---------- Ajustes

const formAjustes = $("#form-ajustes");
const ajustes = await api.ajustes();
formAjustes.precio_suscripcion.value = ajustes.precio_suscripcion;
formAjustes.dias_suscripcion.value = ajustes.dias_suscripcion;

formAjustes.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api.guardarAjustes({
      precio_suscripcion: Math.round(Number(formAjustes.precio_suscripcion.value)),
      dias_suscripcion: Math.round(Number(formAjustes.dias_suscripcion.value)),
    });
    aviso("Precios guardados");
  } catch (err) {
    aviso(err.message, "error");
  }
});

await Promise.all([cargarPagos(), cargarContenido()]);
