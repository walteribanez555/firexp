package com.example.fire_hack.domain.usecase

import com.example.fire_hack.data.model.SessionEvent
import com.example.fire_hack.data.repository.SessionRepository
import kotlinx.coroutines.flow.Flow

class WatchEventsUseCase(private val sessionRepository: SessionRepository) {

    operator fun invoke(sessionId: String): Flow<SessionEvent> =
        sessionRepository.connect(sessionId)
}
