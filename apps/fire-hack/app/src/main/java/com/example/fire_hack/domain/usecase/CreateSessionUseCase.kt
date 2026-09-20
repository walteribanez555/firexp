package com.example.fire_hack.domain.usecase

import com.example.fire_hack.data.repository.SessionRepository

class CreateSessionUseCase(private val sessionRepository: SessionRepository) {

    data class Result(val sessionId: String, val qrUrl: String)

    operator fun invoke(relayBaseUrl: String): Result {
        val sessionId = sessionRepository.createSession()
        val qrUrl = "$relayBaseUrl/join/$sessionId"
        return Result(sessionId = sessionId, qrUrl = qrUrl)
    }
}
