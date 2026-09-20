package com.example.fire_hack.recommendations

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.example.fire_hack.Config
import com.example.fire_hack.data.source.SeriesRemoteSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Re-publishes the Fire TV home-screen recommendation row after a device reboot.
 *
 * Fire OS clears posted recommendations on boot, so the standard Android-TV pattern
 * is to re-post them from a `BOOT_COMPLETED` receiver. We fetch the current catalog
 * from the relay and hand it to [RecommendationsPublisher].
 *
 * Registered in the manifest for `android.intent.action.BOOT_COMPLETED`. Work is done
 * on a goAsync() background scope with a short timeout budget; failures are swallowed
 * (a reboot must never crash into our receiver).
 */
class BootRecommendationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != "android.intent.action.QUICKBOOT_POWERON"
        ) return

        Log.i(TAG, "BOOT_COMPLETED — refreshing recommendations")
        val pending = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val catalog = runCatching {
                    SeriesRemoteSource(Config.RELAY_HOST).fetchSeriesList()
                }.getOrElse {
                    Log.w(TAG, "Boot catalog fetch failed: ${it.message}")
                    emptyList()
                }
                RecommendationsPublisher(appContext).publish(catalog)
            } catch (t: Throwable) {
                Log.w(TAG, "Boot recommendation refresh failed: ${t.message}")
            } finally {
                pending.finish()
            }
        }
    }

    private companion object { const val TAG = "BootRecommendations" }
}
