import { api } from "./api.js";
import { $, clp, fecha, escapar, montarCabecera, aviso, etiquetaEstado, nombreProducto, detener } from "./ui.js";

const usuario = await montarCabecera();
if (!usuario) {
  location.replace("entrar.html?volver=cuenta.html");
  await detener();
}

if (new URLSearchParams(location.search).get("pago") === "cripto") {
  aviso("Pago recibido. Si aún no aparece como pagado, se confirma en unos minutos.");
}

$("#correo").textContent = usuario.email;

const [accesos, pedidos] = await Promise.all([api.accesos(), api.misPedidos()]);
const caja = $("#estado-suscripcion");
if (accesos.suscrito_hasta && new Date(accesos.suscrito_hasta) > new Date()) {
  caja.classList.add("activa");
  caja.innerHTML = `<div><b>Suscripción activa 💗</b><div class="suave chico">Hasta el ${fecha(accesos.suscrito_hasta)}</div></div>
    <a class="boton boton-chico" href="index.html">Ver contenido</a>`;
} else {
  caja.innerHTML = `<div><b>No tienes una suscripción activa</b><div class="suave chico">Suscríbete para ver todo el contenido.</div></div>
    <a class="boton boton-chico" href="pagar.html?producto=suscripcion">Suscribirme</a>`;
}

$("#pedidos").innerHTML = pedidos.length
  ? pedidos.map((p) => `
    <div class="fila">
      <div class="fila-principal">
        <b>${escapar(nombreProducto(p))}</b>
        <span class="suave chico">${fecha(p.creado)} · ${p.metodo === "cripto" ? "Cripto" : "Transferencia"} · ${clp(p.monto)}</span>
        ${p.estado === "rechazado" ? `<div class="chico" style="color:var(--error)">No pude confirmar este pago. Si transferiste, escríbeme con tu comprobante.</div>` : ""}
      </div>
      ${etiquetaEstado(p.estado)}
    </div>`).join("")
  : `<p class="suave">Todavía no tienes pagos.</p>`;
