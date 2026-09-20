package com.example.fire_hack.data.repository

import com.example.fire_hack.data.model.SessionEvent
import com.example.fire_hack.data.source.SessionWebSocketSource
import kotlinx.coroutines.flow.Flow
import java.util.UUID

class SessionRepository(private val source: SessionWebSocketSource) {

    private var currentSessionId: String? = null

    fun createSession(): String {
        currentSessionId = UUID.randomUUID().toString().take(8).uppercase()
        return currentSessionId!!
    }

    fun connect(sessionId: String): Flow<SessionEvent> = source.connect(sessionId)

    fun getSessionId(): String? = currentSessionId
}
