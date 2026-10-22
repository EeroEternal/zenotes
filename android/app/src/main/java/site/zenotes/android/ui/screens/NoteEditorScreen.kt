package site.zenotes.android.ui.screens

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import site.zenotes.android.model.NoteColor
import site.zenotes.android.ui.EditorDraft

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun NoteEditorScreen(
    initialDraft: EditorDraft,
    isSaving: Boolean,
    resolveMediaUrl: (noteId: String, mediaId: String) -> String,
    onSave: (EditorDraft) -> Unit,
    onDelete: (String) -> Unit,
    onCancel: () -> Unit
) {
    var title by rememberSaveable(initialDraft.id) { mutableStateOf(initialDraft.title) }
    var content by rememberSaveable(initialDraft.id) { mutableStateOf(initialDraft.content) }
    var colorName by rememberSaveable(initialDraft.id) { mutableStateOf(initialDraft.color.apiValue) }
    var tags by rememberSaveable(initialDraft.id) { mutableStateOf(initialDraft.tags) }
    var pinned by rememberSaveable(initialDraft.id) { mutableStateOf(initialDraft.pinned) }
    var isPreviewMode by rememberSaveable(initialDraft.id) {
        mutableStateOf(false)
    }
    var newTagText by rememberSaveable { mutableStateOf("") }
    var showAddTagDialog by rememberSaveable { mutableStateOf(false) }
    var showDeleteConfirm by rememberSaveable { mutableStateOf(false) }

    val selectedColor = NoteColor.fromApi(colorName)
    val isDark = isSystemInDarkTheme()
    val bgColor = selectedColor.backgroundColor(isDark)
    val context = LocalContext.current

    fun currentDraft() = EditorDraft(
        id = initialDraft.id,
        title = title,
        content = content,
        color = selectedColor,
        tags = tags,
        pinned = pinned,
        updatedAt = initialDraft.updatedAt
    )

    fun hasChanges(): Boolean {
        return title != initialDraft.title ||
            content != initialDraft.content ||
            selectedColor != initialDraft.color ||
            tags != initialDraft.tags ||
            pinned != initialDraft.pinned
    }

    fun handleBackOrSave() {
        if (isSaving) return
        if (hasChanges() && (title.isNotBlank() || content.isNotBlank())) {
            onSave(currentDraft())
        } else {
            onCancel()
        }
    }

    BackHandler {
        handleBackOrSave()
    }

    if (showDeleteConfirm && initialDraft.id != null) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete Note?") },
            text = { Text("This note will be permanently deleted from ZeNotes.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirm = false
                        onDelete(initialDraft.id)
                    }
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showAddTagDialog) {
        AlertDialog(
            onDismissRequest = { showAddTagDialog = false },
            title = { Text("Add Tag") },
            text = {
                OutlinedTextField(
                    value = newTagText,
                    onValueChange = { newTagText = it.removePrefix("#") },
                    label = { Text("Tag name") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            val clean = newTagText.trim().removePrefix("#")
                            if (clean.isNotEmpty() && tags.none { it.equals(clean, ignoreCase = true) }) {
                                tags = tags + clean
                            }
                            newTagText = ""
                            showAddTagDialog = false
                        }
                    )
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val clean = newTagText.trim().removePrefix("#")
                        if (clean.isNotEmpty() && tags.none { it.equals(clean, ignoreCase = true) }) {
                            tags = tags + clean
                        }
                        newTagText = ""
                        showAddTagDialog = false
                    }
                ) {
                    Text("Add")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddTagDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Scaffold(
        containerColor = bgColor,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = bgColor),
                navigationIcon = {
                    IconButton(onClick = { handleBackOrSave() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                title = {
                    Text(
                        text = if (initialDraft.id == null) "New Note" else "Edit Note",
                        style = MaterialTheme.typography.titleMedium
                    )
                },
                actions = {
                    // Toggle Preview / Edit mode
                    IconButton(onClick = { isPreviewMode = !isPreviewMode }) {
                        Icon(
                            imageVector = if (isPreviewMode) Icons.Default.Edit else Icons.Default.Visibility,
                            contentDescription = if (isPreviewMode) "Edit Markdown" else "Preview Markdown"
                        )
                    }

                    // Pin toggle
                    IconButton(onClick = { pinned = !pinned }) {
                        Icon(
                            imageVector = if (pinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                            contentDescription = if (pinned) "Unpin" else "Pin",
                            tint = if (pinned) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            }
                        )
                    }

                    // Share text
                    IconButton(
                        onClick = {
                            val shareBody = buildString {
                                if (title.isNotBlank()) {
                                    appendLine(title)
                                    appendLine()
                                }
                                append(content)
                            }
                            if (shareBody.isNotBlank()) {
                                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_SUBJECT, title)
                                    putExtra(Intent.EXTRA_TEXT, shareBody)
                                }
                                context.startActivity(Intent.createChooser(sendIntent, "Share Note"))
                            }
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Share,
                            contentDescription = "Share"
                        )
                    }

                    // Delete note (only for existing notes)
                    if (initialDraft.id != null) {
                        IconButton(onClick = { showDeleteConfirm = true }) {
                            Icon(
                                imageVector = Icons.Default.DeleteOutline,
                                contentDescription = "Delete Note",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }

                    // Save Button
                    Button(
                        onClick = { onSave(currentDraft()) },
                        enabled = !isSaving,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.padding(end = 8.dp)
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Save")
                        }
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding()
        ) {
            // Color Picker + Tags Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                NoteColor.entries.forEach { option ->
                    val isSelected = option == selectedColor
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(option.swatchColor)
                            .border(
                                width = if (isSelected) 2.5.dp else 1.dp,
                                color = if (isSelected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.outline
                                },
                                shape = CircleShape
                            )
                            .clickable { colorName = option.apiValue },
                        contentAlignment = Alignment.Center
                    ) {
                        if (isSelected) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = option.label,
                                tint = Color(0xFF241E18),
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }

            // Tags chips
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                tags.forEach { tag ->
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(start = 10.dp, end = 6.dp, top = 4.dp, bottom = 4.dp)
                        ) {
                            Text(
                                text = "#$tag",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Remove tag",
                                modifier = Modifier
                                    .size(14.dp)
                                    .clickable { tags = tags.filterNot { it == tag } },
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                AssistChip(
                    onClick = { showAddTagDialog = true },
                    label = { Text("Add Tag") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                )
            }

            // Quick Markdown Formatting Bar (when in Edit mode)
            if (!isPreviewMode) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    MarkdownQuickButton("H1") { content = appendSnippet(content, "\n# ") }
                    MarkdownQuickButton("H2") { content = appendSnippet(content, "\n## ") }
                    MarkdownQuickButton("Bold") { content = appendSnippet(content, "**bold**") }
                    MarkdownQuickButton("Italic") { content = appendSnippet(content, "*italic*") }
                    MarkdownQuickButton("• List") { content = appendSnippet(content, "\n- ") }
                    MarkdownQuickButton("☐ Todo") { content = appendSnippet(content, "\n- [ ] ") }
                    MarkdownQuickButton("Code") { content = appendSnippet(content, "\n```\n\n```") }
                }
            }

            Divider(
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
                modifier = Modifier.padding(vertical = 4.dp)
            )

            // Main scrollable Title + Content area
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            ) {
                // Title Input
                BasicTextField(
                    value = title,
                    onValueChange = { title = it },
                    readOnly = isPreviewMode,
                    textStyle = TextStyle(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    ),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    decorationBox = { innerTextField ->
                        Box(modifier = Modifier.fillMaxWidth()) {
                            if (title.isEmpty()) {
                                Text(
                                    text = "Title (optional)",
                                    style = TextStyle(
                                        fontSize = 22.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                                    )
                                )
                            }
                            innerTextField()
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(14.dp))

                if (isPreviewMode) {
                    MarkdownPreviewBody(
                        noteId = initialDraft.id,
                        markdown = content,
                        resolveMediaUrl = resolveMediaUrl
                    )
                } else {
                    BasicTextField(
                        value = content,
                        onValueChange = { content = it },
                        textStyle = TextStyle(
                            fontSize = 16.sp,
                            lineHeight = 24.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        ),
                        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                        decorationBox = { innerTextField ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(420.dp)
                            ) {
                                if (content.isEmpty()) {
                                    Text(
                                        text = "Write your note in Markdown or plain text...",
                                        style = TextStyle(
                                            fontSize = 16.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                                        )
                                    )
                                }
                                innerTextField()
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}

private fun appendSnippet(existing: String, snippet: String): String {
    return if (existing.isEmpty()) {
        snippet.trimStart('\n')
    } else {
        existing + snippet
    }
}

@Composable
private fun MarkdownQuickButton(label: String, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f),
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
        )
    }
}

@Composable
private fun MarkdownPreviewBody(
    noteId: String?,
    markdown: String,
    resolveMediaUrl: (noteId: String, mediaId: String) -> String
) {
    val lines = remember(markdown) {
        markdown
            .replace(Regex("""<!--\s*zenotes:ai-summary\s*-->""", RegexOption.IGNORE_CASE), "")
            .lines()
    }
    val imageRegex = remember { Regex("""!\[[^\]]*\]\(zenotes:media:([0-9a-fA-F-]{8,64})\)""") }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        var inCodeBlock = false
        val codeBuffer = StringBuilder()

        for (rawLine in lines) {
            val trimmed = rawLine.trim()
            if (trimmed.startsWith("```")) {
                if (inCodeBlock) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = codeBuffer.toString().trimEnd(),
                            style = TextStyle(
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            ),
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                    codeBuffer.clear()
                    inCodeBlock = false
                } else {
                    inCodeBlock = true
                }
                continue
            }

            if (inCodeBlock) {
                codeBuffer.appendLine(rawLine)
                continue
            }

            // Embedded ZeNotes image check
            val imgMatch = imageRegex.find(trimmed)
            if (imgMatch != null && noteId != null) {
                val mediaId = imgMatch.groupValues[1]
                AsyncImage(
                    model = resolveMediaUrl(noteId, mediaId),
                    contentDescription = "Embedded image",
                    contentScale = ContentScale.FillWidth,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                )
                continue
            }

            when {
                trimmed.startsWith("# ") -> {
                    Text(
                        text = trimmed.removePrefix("# "),
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                trimmed.startsWith("## ") -> {
                    Text(
                        text = trimmed.removePrefix("## "),
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                trimmed.startsWith("### ") -> {
                    Text(
                        text = trimmed.removePrefix("### "),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ") -> {
                    Text(
                        text = "☑ " + trimmed.substring(6),
                        style = MaterialTheme.typography.bodyLarge.copy(
                            textDecoration = TextDecoration.LineThrough
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                trimmed.startsWith("- [ ] ") -> {
                    Text(
                        text = "☐ " + trimmed.substring(6),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                    Text(
                        text = "• " + trimmed.substring(2),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                trimmed.isEmpty() -> {
                    Spacer(modifier = Modifier.height(4.dp))
                }
                else -> {
                    Text(
                        text = formatInlineMarkdown(rawLine),
                        style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 24.sp),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
    }
}

private fun formatInlineMarkdown(text: String) = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        if (text.startsWith("**", i)) {
            val end = text.indexOf("**", i + 2)
            if (end != -1) {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                    append(text.substring(i + 2, end))
                }
                i = end + 2
                continue
            }
        }
        if (text.startsWith("`", i)) {
            val end = text.indexOf("`", i + 1)
            if (end != -1) {
                withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) {
                    append(text.substring(i + 1, end))
                }
                i = end + 1
                continue
            }
        }
        if (text.startsWith("*", i) && !text.startsWith("**", i)) {
            val end = text.indexOf("*", i + 1)
            if (end != -1) {
                withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                    append(text.substring(i + 1, end))
                }
                i = end + 1
                continue
            }
        }
        append(text[i])
        i++
    }
}
