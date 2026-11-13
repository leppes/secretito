// Piezas compartidas por todas las páginas: cabecera, aviso +18, avisos y formatos.
import { CONFIG } from "./config.js";
import { api, modoDemo } from "./api.js";

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const clp = (n) => "$" + Number(n).toLocaleString("es-CL");
export const fecha = (iso) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

// Corta la ejecución de la página (por ejemplo mientras redirige al login).
export const detener = () => new Promise(() => {});

export function escapar(texto = "") {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const ICONO_LOGO = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 5a3 3 0 0 1 6 0v3H9V7Zm3 6.2c1-1 2.8-.4 2.8 1.1 0 1.3-1.6 2.4-2.8 3.4-1.2-1-2.8-2.1-2.8-3.4 0-1.5 1.8-2.1 2.8-1.1Z"/></svg>`;

export const ICONO_CANDADO = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 5a3 3 0 0 1 6 0v3H9V7Z"/></svg>`;

export const ICONO_PLAY = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;

// Pinta la cabecera y devuelve la sesión actual (o null).
export async function montarCabecera() {
  const usuario = await api.sesion();
  const pagina = location.pathname.split("/").pop() || "index.html";
  const volver = encodeURIComponent(pagina + location.search);
  const enEntrar = pagina === "entrar.html";
  const cabecera = document.createElement("header");
  cabecera.className = "barra";
  cabecera.innerHTML = `
    <a class="logo" href="index.html">${ICONO_LOGO}<span>${escapar(CONFIG.nombre)}</span></a>
    <nav>
      ${usuario?.es_admin ? `<a href="admin.html">Panel</a>` : ""}
      ${usuario
        ? `<a href="cuenta.html">Mi cuenta</a><button class="enlace" id="salir">Salir</button>`
        : enEntrar ? "" : `<a class="boton boton-chico" href="entrar.html?volver=${volver}">Entrar</a>`}
    </nav>`;
  document.body.prepend(cabecera);

  if (modoDemo) {
    const cinta = document.createElement("div");
    cinta.className = "cinta-demo";
    cinta.innerHTML = `Modo demo: los datos se guardan solo en este navegador. Crea una cuenta que empiece con <b>admin</b> para ver el panel.`;
    cabecera.after(cinta);
  }

  $("#salir")?.addEventListener("click", async () => {
    await api.salir();
    location.href = "index.html";
  });

  verificarEdad();
  pie();
  return usuario;
}

function verificarEdad() {
  try {
    if (localStorage.getItem("mayor_de_edad") === "si") return;
  } catch {}
  const capa = document.createElement("div");
  capa.className = "capa";
  capa.innerHTML = `
    <div class="dialogo dialogo-edad">
      <div class="logo logo-grande">${ICONO_LOGO}<span>${escapar(CONFIG.nombre)}</span></div>
      <h2>Contenido para mayores de 18</h2>
      <p>Este sitio tiene contenido para adultos. Al entrar confirmas que tienes 18 años o más y que es legal verlo en tu país.</p>
      <div class="fila-botones">
        <button class="boton" id="soy-mayor">Tengo 18 o más</button>
        <a class="boton boton-secundario" href="https://www.google.com">Salir</a>
      </div>
    </div>`;
  document.body.append(capa);
  document.body.classList.add("bloqueado");
  $("#soy-mayor").addEventListener("click", () => {
    try {
      localStorage.setItem("mayor_de_edad", "si");
    } catch {}
    capa.remove();
    document.body.classList.remove("bloqueado");
  });
}

function pie() {
  const pie = document.createElement("footer");
  pie.className = "pie";
  pie.innerHTML = `Solo mayores de 18 · Todo el contenido es propiedad de ${escapar(CONFIG.nombre)} · Prohibido compartirlo o revenderlo`;
  document.body.append(pie);
}

// Reemplazo de confirm(): algunos visores lo bloquean y además así queda con el estilo del sitio.
export function confirmar(mensaje, textoBoton = "Confirmar") {
  return new Promise((resolver) => {
    const capa = document.createElement("div");
    capa.className = "capa";
    capa.innerHTML = `
      <div class="dialogo" role="dialog" aria-modal="true">
        <p>${escapar(mensaje)}</p>
        <div class="fila-botones">
          <button class="boton" data-respuesta="si">${escapar(textoBoton)}</button>
          <button class="boton boton-secundario" data-respuesta="no">Cancelar</button>
        </div>
      </div>`;
    capa.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-respuesta]");
      if (!boton && e.target !== capa) return;
      capa.remove();
      resolver(boton?.dataset.respuesta === "si");
    });
    document.body.append(capa);
    capa.querySelector("[data-respuesta='si']").focus();
  });
}

export function aviso(mensaje, tipo = "ok") {
  const el = document.createElement("div");
  el.className = `aviso aviso-${tipo}`;
  el.textContent = mensaje;
  document.body.append(el);
  setTimeout(() => el.classList.add("visible"), 10);
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Solo acepta páginas propias como destino de "volver" (evita redirigir a otros sitios).
export function destinoSeguro(valor, porDefecto = "index.html") {
  return valor && /^[a-z]+\.html(\?[\w=&%.-]*)?$/.test(valor) ? valor : porDefecto;
}

export const ESTADOS = {
  pendiente: ["Pendiente", "neutro"],
  revision: ["En revisión", "alerta"],
  pagado: ["Pagado", "ok"],
  rechazado: ["Rechazado", "error"],
};

export function etiquetaEstado(estado) {
  const [texto, tono] = ESTADOS[estado] ?? [estado, "neutro"];
  return `<span class="etiqueta etiqueta-${tono}">${texto}</span>`;
}

export function nombreProducto(p) {
  return p.producto === "suscripcion" ? "Suscripción" : (p.publicaciones?.titulo ?? "Publicación");
}
