import { CONFIG } from "./config.js";
import { api, modoDemo } from "./api.js";
import { $, clp, escapar, montarCabecera, aviso, detener } from "./ui.js";

const usuario = await montarCabecera();
if (!usuario) {
  location.replace(`entrar.html?volver=${encodeURIComponent("pagar.html" + location.search)}`);
  await detener();
}

const parametros = new URLSearchParams(location.search);
const producto = parametros.get("producto") === "publicacion" ? "publicacion" : "suscripcion";
const idPublicacion = parametros.get("id");

const [ajustes, publicaciones, accesos] = await Promise.all([api.ajustes(), api.publicaciones(), api.accesos()]);
const publicacion = publicaciones.find((p) => p.id === idPublicacion);

if (producto === "publicacion") {
  if (!publicacion || publicacion.acceso !== "compra") {
    $("#tarjeta").innerHTML = `<h2>Esta publicación ya no está a la venta</h2><a href="index.html">Volver al perfil</a>`;
    await detener();
  }
  if (accesos.compradas.includes(publicacion.id)) {
    $("#tarjeta").innerHTML = `<h2>Ya compraste esta publicación 💗</h2><a class="boton" href="index.html">Ver contenido</a>`;
    await detener();
  }
}

const monto = producto === "suscripcion" ? ajustes.precio_suscripcion : publicacion.precio;
$("#tipo-producto").textContent = producto === "suscripcion" ? `Suscripción · ${ajustes.dias_suscripcion} días` : "Compra individual";
$("#nombre-producto").textContent = producto === "suscripcion" ? `Todo el contenido de ${CONFIG.nombre}` : publicacion.titulo;
$("#precio").textContent = clp(monto);

// ---------- Elegir método

const criptoDisponible = CONFIG.cripto || modoDemo;
if (!criptoDisponible) {
  $('[data-metodo="cripto"]').disabled = true;
  $("#detalle-cripto").textContent = "Disponible pronto";
}
if (modoDemo) $("#detalle-cripto").textContent = "Modo demo: el pago se simula y se aprueba al instante";

document.querySelectorAll(".metodo").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelectorAll(".metodo").forEach((b) => b.setAttribute("aria-pressed", String(b === boton)));
    $("#transferencia").hidden = boton.dataset.metodo !== "transferencia";
    $("#cripto").hidden = boton.dataset.metodo !== "cripto";
  });
});

// ---------- Transferencia

const t = CONFIG.transferencia;
const datos = [
  ["Nombre", t.nombre], ["RUT", t.rut], ["Banco", t.banco], ["Tipo de cuenta", t.tipo],
  ["Número", t.numero], ["Correo", t.email], ["Monto", clp(monto), String(monto)], ["Comentario", usuario.email],
];
$("#datos-banco").innerHTML = datos
  .filter(([, valor]) => valor)
  .map(([nombre, valor, copia = valor]) => `
    <div class="dato"><span>${nombre}</span>
      <div><b>${escapar(valor)}</b><button class="copiar" data-copiar="${escapar(copia)}">Copiar</button></div>
    </div>`)
  .join("");

$("#datos-banco").addEventListener("click", async (e) => {
  const boton = e.target.closest("[data-copiar]");
  if (!boton) return;
  try {
    await navigator.clipboard.writeText(boton.dataset.copiar);
    aviso("Copiado");
  } catch {
    aviso("No se pudo copiar, cópialo a mano", "error");
  }
});

$("#enviar-comprobante").addEventListener("click", async () => {
  const archivo = $("#comprobante").files[0];
  const error = $("#error-transferencia");
  error.textContent = "";
  if (!archivo) return (error.textContent = "Sube la captura o el comprobante de la transferencia");
  if (archivo.size > 10e6) return (error.textContent = "El archivo es muy grande (máximo 10 MB)");

  const boton = $("#enviar-comprobante");
  boton.disabled = true;
  boton.textContent = "Enviando…";
  try {
    const pedido = await api.crearPedido(producto, publicacion?.id);
    await api.subirComprobante(pedido.id, archivo);
    $("#elegir").hidden = true;
    $("#transferencia").hidden = true;
    $("#listo").hidden = false;
  } catch (err) {
    error.textContent = err.message;
    boton.disabled = false;
    boton.textContent = "Ya transferí, enviar comprobante";
  }
});

// ---------- Cripto

$("#pagar-cripto").addEventListener("click", async () => {
  const boton = $("#pagar-cripto");
  boton.disabled = true;
  boton.textContent = "Preparando pago…";
  try {
    location.href = await api.pagarCripto(producto, publicacion?.id);
  } catch (err) {
    $("#error-cripto").textContent = err.message;
    boton.disabled = false;
    boton.textContent = "Pagar con cripto";
  }
});
