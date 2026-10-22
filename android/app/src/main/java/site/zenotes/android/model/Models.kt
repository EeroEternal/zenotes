package site.zenotes.android.model

import androidx.compose.ui.graphics.Color

enum class NoteColor(
    val apiValue: String,
    val label: String,
    val lightBg: Color,
    val darkBg: Color,
    val swatchColor: Color
) {
    WHITE(
        apiValue = "white",
        label = "Default",
        lightBg = Color(0xFFFFFFFF),
        darkBg = Color(0xFF29221E),
        swatchColor = Color(0xFFF5F2EB)
    ),
    YELLOW(
        apiValue = "yellow",
        label = "Cream",
        lightBg = Color(0xFFFBF6E9),
        darkBg = Color(0xFF332B19),
        swatchColor = Color(0xFFF6D87A)
    ),
    GREEN(
        apiValue = "green",
        label = "Mint",
        lightBg = Color(0xFFE5F6EE),
        darkBg = Color(0xFF192E26),
        swatchColor = Color(0xFF7CD4A8)
    ),
    BLUE(
        apiValue = "blue",
        label = "Sky",
        lightBg = Color(0xFFE3F3FC),
        darkBg = Color(0xFF172836),
        swatchColor = Color(0xFF7CC4F2)
    ),
    PINK(
        apiValue = "pink",
        label = "Rose",
        lightBg = Color(0xFFFAECF0),
        darkBg = Color(0xFF371B23),
        swatchColor = Color(0xFFF29BB2)
    ),
    PURPLE(
        apiValue = "purple",
        label = "Lavender",
        lightBg = Color(0xFFF2ECFA),
        darkBg = Color(0xFF281D35),
        swatchColor = Color(0xFFB99BF2)
    );

    fun backgroundColor(isDark: Boolean): Color = if (isDark) darkBg else lightBg

    companion object {
        fun fromApi(value: String?): NoteColor {
            if (value.isNullOrBlank()) return WHITE
            return entries.firstOrNull { it.apiValue.equals(value.trim(), ignoreCase = true) } ?: WHITE
        }
    }
}

data class CurrentUser(
    val id: Long,
    val username: String,
    val email: String,
    val token: String? = null
)

data class Note(
    val id: String,
    val title: String?,
    val content: String,
    val color: NoteColor,
    val tags: List<String>,
    val pinned: Boolean,
    val position: Int,
    val createdAt: String,
    val updatedAt: String
) {
    fun embeddedMediaIds(): List<String> {
        val regex = Regex("""zenotes:media:([0-9a-fA-F-]{8,64})""")
        return regex.findAll(content).map { it.groupValues[1] }.distinct().toList()
    }

    fun previewText(maxChars: Int = 260): String {
        var s = content
            .replace(Regex("""<!--\s*zenotes:ai-summary\s*-->""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""!\[[^\]]*\]\(zenotes:media:[^)]+\)"""), "")
            .trim()

        val aiMatch = Regex("""^##\s*AI\s*总结\s*$""", RegexOption.MULTILINE).find(s)
        if (aiMatch != null) {
            val before = s.substring(0, aiMatch.range.first).trimEnd()
            var after = s.substring(aiMatch.range.last + 1)
                .replace(Regex("""\n###\s*OCR\s*原文[\s\S]*$""", RegexOption.IGNORE_CASE), "")
                .trim()
            if (after.length > 240) {
                after = after.take(240).trimEnd() + "…"
            }
            s = listOf(before, after).filter { it.isNotBlank() }.joinToString("\n\n")
        }

        // Clean lightweight markdown markers for card preview readability
        s = s.replace(Regex("""^#{1,6}\s+""", RegexOption.MULTILINE), "")
            .replace("**", "")
            .replace("__", "")
            .trim()

        if (s.length <= maxChars) return s
        val cut = s.take(maxChars)
        val lastNewline = cut.lastIndexOf('\n')
        val sliced = if (lastNewline > maxChars / 2) cut.substring(0, lastNewline) else cut
        return sliced.trimEnd() + "…"
    }
}
