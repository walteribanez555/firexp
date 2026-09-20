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
    private const val RELAY_LAN = "http://192.168.0.12:3001" // LAN IP of the relay machine

    /**
     * Host the TV app connects to (HTTP + WebSocket).
     *  - Emulator TV (current): 10.0.2.2 — the emulator's alias for the host loopback.
     *  - Physical Fire TV: set this to RELAY_LAN instead.
     */
    const val RELAY_HOST = "http://10.0.2.2:3001"
    val RELAY_WS get() = RELAY_HOST.replace("http", "ws")

    /** Host embedded in the QR the (physical) phone scans — always the relay machine's LAN IP. */
    const val PHONE_HOST = RELAY_LAN
}
