package site.zenotes.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import site.zenotes.android.model.Note
import site.zenotes.android.model.NoteColor

class NoteModelTest {

    @Test
    fun noteColorFromApiMapsCorrectly() {
        assertEquals(NoteColor.YELLOW, NoteColor.fromApi("yellow"))
        assertEquals(NoteColor.GREEN, NoteColor.fromApi("GREEN"))
        assertEquals(NoteColor.WHITE, NoteColor.fromApi("unknown"))
        assertEquals(NoteColor.WHITE, NoteColor.fromApi(null))
    }

    @Test
    fun previewTextStripsMediaAndAiMarkers() {
        val raw = """
            # Weekly Ideas
            Here is a **great** idea!
            ![image](zenotes:media:123e4567-e89b-12d3-a456-426614174000)
            <!-- zenotes:ai-summary -->
            ## AI 总结
            Short summary of image.
            ### OCR 原文
            Very long OCR text that should be dropped from card preview.
        """.trimIndent()

        val note = Note(
            id = "n1",
            title = "Weekly Ideas",
            content = raw,
            color = NoteColor.YELLOW,
            tags = listOf("ideas", "work"),
            pinned = true,
            position = 0,
            createdAt = "2026-10-22",
            updatedAt = "2026-10-22"
        )

        val preview = note.previewText()
        assertTrue(preview.contains("Weekly Ideas"))
        assertTrue(preview.contains("Here is a great idea!"))
        assertTrue(preview.contains("Short summary of image."))
        assertTrue(!preview.contains("zenotes:media:"))
        assertTrue(!preview.contains("Very long OCR text"))

        val mediaIds = note.embeddedMediaIds()
        assertEquals(listOf("123e4567-e89b-12d3-a456-426614174000"), mediaIds)
    }
}
