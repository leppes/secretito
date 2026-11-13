import { api } from "./api.js";
import { $, montarCabecera, destinoSeguro } from "./ui.js";

const volver = destinoSeguro(new URLSearchParams(location.search).get("volver"));
if (await montarCabecera()) location.replace(volver);

let modo = "entrar";
const form = $("#formulario");

document.querySelectorAll(".pestanas button").forEach((boton) => {
  boton.addEventListener("click", () => {
    modo = boton.dataset.modo;
    document.querySelector(".pestanas .activa").classList.remove("activa");
    boton.classList.add("activa");
    $("#casilla-terminos").hidden = modo !== "registro";
    $("#enviar").textContent = modo === "registro" ? "Crear cuenta" : "Entrar";
    form.clave.autocomplete = modo === "registro" ? "new-password" : "current-password";
    $("#error").textContent = "";
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  const clave = form.clave.value;
  const error = $("#error");
  error.textContent = "";

  if (!/^\S+@\S+\.\S+$/.test(email)) return (error.textContent = "Escribe un correo válido");
  if (clave.length < 6) return (error.textContent = "La contraseña debe tener al menos 6 caracteres");
  if (modo === "registro" && !form.terminos.checked) return (error.textContent = "Debes confirmar que eres mayor de 18");

  const boton = $("#enviar");
  boton.disabled = true;
  try {
    if (modo === "registro") {
      const { confirmar } = await api.registrar(email, clave);
      if (confirmar) {
        form.hidden = true;
        document.querySelector(".pestanas").hidden = true;
        $("#revisa-correo").hidden = false;
        return;
      }
    } else {
      await api.entrar(email, clave);
    }
    location.href = volver;
  } catch (err) {
    error.textContent = err.message;
  } finally {
    boton.disabled = false;
  }
});
