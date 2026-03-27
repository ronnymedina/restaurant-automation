- Existe un problema de diferencias de validaciones entre lo que muestra el módulo de Dashboard de los pedidos y la cocina. 
- En el módulo de la caja, cuando se cierra la caja, tendría que haber una notificación o algo que le indique al usuario que hay pedidos pendientes. Esto es porque al cerrar la caja, ponerle que tienes un pedido en proceso o creado y vas a cerrar la caja. Estos pedidos quedan como colgando ahí. No deberían; debería mandar una notificación al cliente de que hay pedidos pendientes que resuelva primero eso y que luego vuelva a hacer cerrar la caja. 
- Bien el módulo de cocina, el que muestra los pedidos en el dashboard, está generando otro problema.

Cuando se abren y se cierran sesiones, por ejemplo, había una caja hoy y yo tenía pedidos ahí y luego cerré esta caja por algún motivo y vuelvo a abrir otra más tarde.

El problema que está ocurriendo es que el módulo de cocina, este que muestra los pedidos, sigue mostrando el estado actual de todos los pedidos del día y de sesiones anteriores.

Lo ideal es que muestre sólo los pedidos que están en el momento en que la caja se abrió. Por ejemplo si se abrió una caja con el ID 5, sólo tiene que mostrar los pedidos de esa caja con ID 5.

Nunca tienen que ir entre el historial de cajas que se abrieron y cerraron porque es confuso. Puede ver un historial pero acá no tiene sentido.

La ideal es que directamente cuando yo abra una sesión, el módulo de cocina debe ser "pedidos" y que esté relacionado sólo para ver los pedidos de ese historial de esa caja que está abierta.

Una vez que se cierre ya no tiene que mostrar nada; simplemente tiene que quedar cerrado y no tiene que mostrar ningún pedido.

