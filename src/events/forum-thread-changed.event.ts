/**
 * Señal genérica de "algo cambió en este hilo" (respuesta nueva, editada o
 * borrada; el hilo se editó, se fijó/cerró, o se marcó/sacó una solución).
 * No lleva el payload completo a propósito: quien está mirando el hilo ya
 * tiene el REST para traer el estado fresco — esto sólo le avisa que lo
 * pida. La usa ForumGateway para reenviar un "refrescá" por WebSocket a
 * quien tenga el hilo abierto.
 */
export class ForumThreadChangedEvent {
  constructor(public readonly threadId: string) { }
}
