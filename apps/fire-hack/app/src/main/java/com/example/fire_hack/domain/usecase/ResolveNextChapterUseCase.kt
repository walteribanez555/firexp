package com.example.fire_hack.domain.usecase

import com.example.fire_hack.data.model.Chapter
import com.example.fire_hack.data.repository.StoryRepository

class ResolveNextChapterUseCase(private val storyRepository: StoryRepository) {

    operator fun invoke(currentChapter: Chapter, decisionId: String?): Chapter? {
        val nextId = if (decisionId != null) {
            currentChapter.options
                .firstOrNull { it.id == decisionId }
                ?.nextChapterId
                ?: currentChapter.defaultNextId
        } else {
            currentChapter.defaultNextId
        }
        return nextId?.let { storyRepository.getChapter(it) }
    }
}
