package com.example.fire_hack

/**
 * Backend host for the TV app. Points at the deployed relay (ECS Fargate, dev),
 * which serves WebSocket + proxies the content-api and serves the phone page.
 *
 * The relay's public IP is EPHEMERAL (dev has no load balancer) — it changes on
 * every relay redeploy/restart. Refresh it with:
 *   bash infra/scripts/relay-ip.sh
 * For purely local development instead: "http://10.0.2.2:3001" on the Android TV
 * emulator, or the host LAN IP on a physical device.
 */
object Config {
    /** Deployed relay (firexp-dev-relay). Reachable by emulator, Fire TV and phones. */
    private const val RELAY_CLOUD = "http://3.94.52.234:3001"

    /** Host the TV app connects to (HTTP + WebSocket). */
    const val RELAY_HOST = RELAY_CLOUD
    val RELAY_WS get() = RELAY_HOST.replace("http", "ws")

    /** Host embedded in the QR the phone scans. */
    const val PHONE_HOST = RELAY_CLOUD
}
