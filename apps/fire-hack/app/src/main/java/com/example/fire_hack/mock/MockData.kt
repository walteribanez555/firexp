package com.example.fire_hack.mock

import com.example.fire_hack.data.model.Chapter
import com.example.fire_hack.data.model.Decision
import com.example.fire_hack.data.model.EpisodeSummary
import com.example.fire_hack.data.model.Series

object MockData {

    val series = listOf(
        Series(
            id          = "series1",
            title       = "Mystery House",
            description = "An interactive horror experience where your choices change everything.",
            thumbnailUrl = "",
            episodes    = listOf(
                EpisodeSummary(id = "episode1", number = 1, title = "The House at the End of the Road", thumbnailUrl = ""),
                EpisodeSummary(id = "ep2",      number = 2, title = "The Cellar Below",                  thumbnailUrl = ""),
            )
        ),
        Series(
            id          = "series2",
            title       = "Deep Signal",
            description = "A sci-fi thriller about first contact.",
            thumbnailUrl = "",
            episodes    = listOf(
                EpisodeSummary(id = "ep3", number = 1, title = "Transmission",  thumbnailUrl = ""),
                EpisodeSummary(id = "ep4", number = 2, title = "The Response",  thumbnailUrl = ""),
            )
        ),
        Series(
            id          = "series3",
            title       = "Hollow Hour",
            description = "A locked bunker, a dying signal, and a choice that decides who sees sunrise.",
            thumbnailUrl = "",
            episodes    = listOf(
                EpisodeSummary(id = "ep5", number = 1, title = "The Undertow",  thumbnailUrl = ""),
                EpisodeSummary(id = "ep6", number = 2, title = "Deadfall",       thumbnailUrl = ""),
            )
        ),
        Series(
            id          = "series4",
            title       = "Night Shift",
            description = "The hospital empties at 3 a.m. — but you are not alone on the ward.",
            thumbnailUrl = "",
            episodes    = listOf(
                EpisodeSummary(id = "ep7", number = 1, title = "Rounds",         thumbnailUrl = ""),
                EpisodeSummary(id = "ep8", number = 2, title = "Code Black",      thumbnailUrl = ""),
            )
        ),
        Series(
            id          = "series5",
            title       = "Static Kin",
            description = "A family reunion over a radio that should have stayed off.",
            thumbnailUrl = "",
            episodes    = listOf(
                EpisodeSummary(id = "ep9",  number = 1, title = "Homecoming",     thumbnailUrl = ""),
                EpisodeSummary(id = "ep10", number = 2, title = "Interference",   thumbnailUrl = ""),
            )
        ),
        Series(
            id          = "series6",
            title       = "Red Tide",
            description = "The town's catch came back wrong. So did the fishermen.",
            thumbnailUrl = "",
            episodes    = listOf(
                EpisodeSummary(id = "ep11", number = 1, title = "Low Water",      thumbnailUrl = ""),
                EpisodeSummary(id = "ep12", number = 2, title = "The Haul",       thumbnailUrl = ""),
            )
        ),
        Series(
            id          = "series7",
            title       = "Pale Fire",
            description = "A wildfire, a mountain road, and three ways down that all end differently.",
            thumbnailUrl = "",
            episodes    = listOf(
                EpisodeSummary(id = "ep13", number = 1, title = "Evacuation",     thumbnailUrl = ""),
                EpisodeSummary(id = "ep14", number = 2, title = "Backdraft",      thumbnailUrl = ""),
            )
        ),
    )

    val chapters = listOf(
        Chapter(
            id             = "ch1",
            videoIn        = 0L,
            videoOut       = 38_000L,
            decisionAt     = 30_000L,
            decisionWindow = 6_000L,
            options        = listOf(
                Decision(id = "go_in", label = "Enter the house", nextChapterId = "ch2"),
                Decision(id = "wait",  label = "Stay outside",    nextChapterId = "ch2"),
            ),
            defaultNextId = "ch2",
        ),
        Chapter(
            id             = "ch2",
            videoIn        = 38_000L,
            videoOut       = 76_000L,
            decisionAt     = 68_000L,
            decisionWindow = 5_000L,
            options        = listOf(
                Decision(id = "go_down", label = "Go to the basement", nextChapterId = "ch3"),
                Decision(id = "stay",    label = "Stay upstairs",      nextChapterId = "ch3"),
            ),
            defaultNextId = "ch3",
        ),
        Chapter(
            id             = "ch3",
            videoIn        = 76_000L,
            videoOut       = 110_000L,
            decisionAt     = null,
            decisionWindow = 0L,
            options        = emptyList(),
            defaultNextId  = null,
        ),
    )

    val chapterTitles = mapOf(
        "ch1" to "The Arrival",
        "ch2" to "The Basement",
        "ch3" to "The Escape",
    )
}
