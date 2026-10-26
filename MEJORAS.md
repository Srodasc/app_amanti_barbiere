# Mejoras a Amanti Barbiere

## Qué cambió y por qué
| Antes | Ahora |
|---|---|
| Cualquiera podía leer todas las citas/clientes con la clave pública | RLS cerrada: el público solo ve barberos, servicios y horarios (columnas limitadas) |
| Doble reserva posible (se calculaba en el navegador) | La base de datos lo impide (`appointments_no_overlap`) y calcula los horarios libres |
| Registro abierto → cualquiera se volvía admin | `handle_new_user` solo crea perfil; sin `/register` |
| Clientes con contraseña en texto plano y sesión falsificable | Sin cuentas de cliente: reserva con nombre + WhatsApp y enlace privado `/cita/<token>` |
| Sin rol de barbero | `/mi-dia`: cada barbero ve y gestiona solo sus citas |
| Sin recordatorios reales | Cola `notifications` + `/api/cron/reminders` (WhatsApp Cloud API) |
| Horarios solo semanales | Además: descansos fijos, días especiales y bloqueos, con pantalla en Barberos → Horarios y en `/mi-dia` |
| Fidelización sin configurar | `loyalty_rules` / `loyalty_balances` y funciones listas; falta UI |

## Cómo aplicarlo (en este orden)
1. **Respalda** tu base de Supabase (Database → Backups) antes de nada.
2. En un proyecto/branch de prueba, ejecuta `supabase/migrations/20261026000001_hardening.sql`.
   - Si hay citas que se traslapan para un mismo barbero, la migración se detiene y te dice cuáles: corrígelas y repite.
   - Las citas futuras **sin barbero** no bloquean horarios: asígnales uno.
3. Variables en Vercel: ver `.env.example` (incluye `CRON_SECRET` y WhatsApp). Empieza con `WHATSAPP_DRY_RUN=true`.
4. Crea el primer acceso de barbero desde Dashboard → Barberos → ícono de llave.
5. Programa el cron con `supabase/cron_recordatorios.sql.example`.
6. Plantillas de WhatsApp: crea y aprueba en Meta `cita_confirmada`, `cita_recordatorio`, `cita_cancelada`.

## Importante
- Las contraseñas de clientes que estaban en texto plano se anularon (`password_hash = null`). Si alguien reutilizaba esa clave en otro sitio, conviene avisarle.
- Los scripts destructivos viejos están en `supabase/legacy/`; no los ejecutes.
- Pendiente recomendado: captcha (Cloudflare Turnstile) en la reserva y UI para fidelización.
