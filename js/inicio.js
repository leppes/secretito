import { CONFIG } from "./config.js";
import { api } from "./api.js";
import { $, clp, fecha, escapar, montarCabecera, aviso, ICONO_CANDADO, ICONO_PLAY } from "./ui.js";

const usuario = await montarCabecera();
const [ajustes, publicaciones, accesos] = await Promise.all([api.ajustes(), api.publicaciones(), api.accesos()]);
const suscrito = accesos.suscrito_hasta && new Date(accesos.suscrito_hasta) > new Date();

function desbloqueada(p) {
  return p.acceso === "gratis"
    || usuario?.es_admin
    || (p.acceso === "suscriptores" && suscrito)
    || (p.acceso === "compra" && accesos.compradas.includes(p.id));
}

// ---------- Perfil

document.title = CONFIG.nombre;
$("#nombre").textContent = CONFIG.nombre;
$("#usuario").textContent = CONFIG.usuario;
$("#bio").textContent = CONFIG.bio;
if (CONFIG.portada) $("#portada").style.backgroundImage = `url("${CONFIG.portada}")`;
if (CONFIG.avatar) $("#avatar").style.backgroundImage = `url("${CONFIG.avatar}")`;
else $("#avatar").textContent = CONFIG.nombre.charAt(0);

const fotos = publicaciones.filter((p) => p.tipo === "foto").length;
$("#estadisticas").innerHTML = `
  <span><b>${publicaciones.length}</b> publicaciones</span>
  <span><b>${fotos}</b> fotos</span>
  <span><b>${publicaciones.length - fotos}</b> videos</span>`;

const redes = Object.entries(CONFIG.redes).filter(([, url]) => url);
$("#redes").innerHTML = redes
  .map(([red, url]) => `<a href="${escapar(url)}" target="_blank" rel="noopener">${red[0].toUpperCase() + red.slice(1)}</a>`)
  .join("");

const caja = $("#caja-suscripcion");
if (suscrito) {
  caja.classList.add("activa");
  caja.innerHTML = `
    <div><b>Estás suscrito 💗</b><div class="suave chico">Acceso a todo hasta el ${fecha(accesos.suscrito_hasta)}</div></div>
    <a class="boton boton-secundario boton-chico" href="pagar.html?producto=suscripcion">Renovar</a>`;
} else if (usuario?.es_admin) {
  caja.innerHTML = `<div><b>Estás viendo tu sitio como administradora</b><div class="suave chico">Ves todo desbloqueado.</div></div>
    <a class="boton boton-chico" href="admin.html">Ir al panel</a>`;
} else {
  caja.innerHTML = `
    <div>
      <div class="suave chico">Suscripción · ${ajustes.dias_suscripcion} días</div>
      <div class="precio">${clp(ajustes.precio_suscripcion)}</div>
    </div>
    <a class="boton" href="pagar.html?producto=suscripcion">Suscribirme</a>`;
}

// ---------- Grilla

function pieza(p) {
  const abierta = desbloqueada(p);
  const tipo = p.tipo === "video" ? `${ICONO_PLAY} Video` : "Foto";
  const candado = abierta ? "" : `
    <div class="pieza-candado">
      ${ICONO_CANDADO}
      <span class="pildora">${p.acceso === "compra" ? clp(p.precio) : "Suscriptores"}</span>
    </div>`;
  return `
    <button class="pieza ${abierta ? "" : "bloqueada"}" data-id="${p.id}">
      <img src="${p.previaUrl}" alt="" loading="lazy" ${abierta && p.muestra ? `data-nitida="${p.archivoUrl}"` : ""}>
      <span class="pieza-tipo">${tipo}</span>
      ${candado}
      <span class="pieza-titulo">${escapar(p.titulo)}</span>
    </button>`;
}

function pintar(filtro) {
  const lista = publicaciones.filter((p) => filtro === "todo" || p.tipo === filtro);
  $("#grilla").innerHTML = lista.length ? lista.map(pieza).join("") : `<p class="vacio">Todavía no hay nada aquí.</p>`;
  // las piezas desbloqueadas muestran la imagen nítida en vez de la previa difuminada
  for (const img of document.querySelectorAll("img[data-nitida]")) img.src = img.dataset.nitida;
  cargarNitidas(lista.filter((p) => desbloqueada(p) && !p.muestra && p.tipo === "foto"));
}

async function cargarNitidas(lista) {
  for (const p of lista) {
    try {
      const url = await api.urlArchivo(p);
      const img = $(`.pieza[data-id="${p.id}"] img`);
      if (img) img.src = url;
    } catch {}
  }
}

document.querySelectorAll(".pestanas button").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelector(".pestanas .activa").classList.remove("activa");
    boton.classList.add("activa");
    pintar(boton.dataset.filtro);
  });
});

$("#grilla").addEventListener("click", (e) => {
  const boton = e.target.closest(".pieza");
  if (!boton) return;
  const p = publicaciones.find((x) => x.id === boton.dataset.id);
  if (desbloqueada(p)) abrirVisor(p);
  else if (p.acceso === "compra") location.href = `pagar.html?producto=publicacion&id=${encodeURIComponent(p.id)}`;
  else location.href = "pagar.html?producto=suscripcion";
});

// ---------- Visor

async function abrirVisor(p) {
  try {
    const url = await api.urlArchivo(p);
    const medio = $("#visor-medio");
    medio.innerHTML = p.tipo === "video" && !p.muestra
      ? `<video src="${url}" controls autoplay playsinline controlslist="nodownload" disablepictureinpicture></video>`
      : `<img src="${url}" alt="">`;
    $("#visor-titulo").textContent = p.titulo;
    $("#visor-descripcion").textContent = p.descripcion ?? "";
    $("#visor").hidden = false;
    document.body.classList.add("bloqueado");
  } catch (err) {
    aviso(err.message, "error");
  }
}

function cerrarVisor() {
  $("#visor").hidden = true;
  $("#visor-medio").innerHTML = "";
  document.body.classList.remove("bloqueado");
}

$("#cerrar-visor").addEventListener("click", cerrarVisor);
$("#visor").addEventListener("click", (e) => e.target.id === "visor" && cerrarVisor());
$("#visor").addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => e.key === "Escape" && cerrarVisor());

pintar("todo");
