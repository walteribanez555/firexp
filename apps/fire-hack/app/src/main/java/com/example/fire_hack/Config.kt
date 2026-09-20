package com.example.fire_hack

/**
 * Cambia RELAY_HOST por la IP local de la máquina que corre el relay.
 * Cómo obtenerla:
 *   macOS/Linux → ifconfig | grep "inet " | grep -v 127
 *   Windows     → ipconfig | findstr "IPv4"
 *
 * La TV y el teléfono deben estar en la misma red WiFi.
 */
object Config {
    /**
     * LAN IP of the machine running the relay. TV + phone must be on the same WiFi.
     * Update this when the host IP changes (DHCP). Get it with:
     *   macOS/Linux → ifconfig | grep "inet " | grep -v 127
     * Emulator note: for the Android TV AVD use "http://10.0.2.2:3001" instead
     * (the emulator can't reach the host LAN IP; 10.0.2.2 is its host-loopback alias).
     */
    /**
     * Deployed relay (ECS Fargate, dev). Public IP — reachable from the emulator,
     * a physical Fire TV, and phones alike, so RELAY_HOST and PHONE_HOST are the same.
     *
     * NOTE: this dev task has an EPHEMERAL public IP that changes on every relay
     * redeploy/restart. Get the current one with:
     *   bash infra/scripts/relay-ip.sh
     * (For local development instead, use "http://10.0.2.2:3001" on the emulator
     * or the host LAN IP on a physical device.)
     */
    private const val RELAY_CLOUD = "http://3.86.97.226:3001" // firexp-dev-relay (Fargate)

    /** Host the TV app connects to (HTTP + WebSocket). */
    const val RELAY_HOST = RELAY_CLOUD
    val RELAY_WS get() = RELAY_HOST.replace("http", "ws")

    /** Host embedded in the QR the phone scans. */
    const val PHONE_HOST = RELAY_CLOUD
}
