package site.zenotes.android.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ViewAgenda
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import site.zenotes.android.model.Note
import site.zenotes.android.model.NoteColor
import site.zenotes.android.ui.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesListScreen(
    state: UiState,
    snackbarHostState: SnackbarHostState,
    resolveMediaUrl: (noteId: String, mediaId: String) -> String,
    onSearchQueryChange: (String) -> Unit,
    onSelectTag: (String?) -> Unit,
    onSelectColor: (NoteColor?) -> Unit,
    onTogglePinnedOnly: () -> Unit,
    onClearFilters: () -> Unit,
    onToggleLayout: () -> Unit,
    onRefresh: () -> Unit,
    onNewNote: () -> Unit,
    onOpenNote: (Note) -> Unit,
    onToggleNotePin: (Note) -> Unit,
    onLogout: () -> Unit
) {
    var showAccountMenu by remember { mutableStateOf(false) }
    val filteredNotes = state.filteredNotes

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                ),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.primaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.EditNote,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "ZeNotes",
                                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                            )
                            Text(
                                text = "${state.notes.size} notes",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onToggleLayout) {
                        Icon(
                            imageVector = if (state.isGridLayout) {
                                Icons.Default.ViewAgenda
                            } else {
                                Icons.Default.GridView
                            },
                            contentDescription = "Toggle Grid/List View"
                        )
                    }
                    IconButton(onClick = onRefresh, enabled = !state.isLoadingNotes) {
                        if (state.isLoadingNotes) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = "Sync Notes"
                            )
                        }
                    }
                    Box {
                        Surface(
                            modifier = Modifier
                                .padding(end = 8.dp)
                                .size(34.dp)
                                .clip(CircleShape)
                                .clickable { showAccountMenu = true },
                            color = MaterialTheme.colorScheme.secondaryContainer
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = (state.user?.username?.firstOrNull()?.uppercaseChar() ?: 'U').toString(),
                                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                            }
                        }
                        DropdownMenu(
                            expanded = showAccountMenu,
                            onDismissRequest = { showAccountMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = {
                                    Column {
                                        Text(
                                            text = state.user?.username ?: "",
                                            fontWeight = FontWeight.SemiBold
                                        )
                                        if (!state.user?.email.isNullOrBlank()) {
                                            Text(
                                                text = state.user?.email ?: "",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                },
                                onClick = { showAccountMenu = false },
                                enabled = false
                            )
                            DropdownMenuItem(
                                text = { Text("Sign Out") },
                                leadingIcon = {
                                    Icon(Icons.Default.Logout, contentDescription = null)
                                },
                                onClick = {
                                    showAccountMenu = false
                                    onLogout()
                                }
                            )
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNewNote,
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                icon = { Icon(Icons.Default.Add, contentDescription = "New Note") },
                text = { Text("New Note", fontWeight = FontWeight.SemiBold) }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (state.isLoadingNotes) {
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                )
            }

            // Search Input
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = onSearchQueryChange,
                placeholder = { Text("Search notes, titles, or #tags...") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                trailingIcon = {
                    if (state.searchQuery.isNotEmpty()) {
                        IconButton(onClick = { onSearchQueryChange("") }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear search")
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp)
            )

            // Filter Bar: Pinned + Color dots + Tags
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                FilterChip(
                    selected = !state.pinnedOnly && state.selectedTag == null && state.selectedColor == null,
                    onClick = onClearFilters,
                    label = { Text("All") }
                )

                FilterChip(
                    selected = state.pinnedOnly,
                    onClick = onTogglePinnedOnly,
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.PushPin,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    label = { Text("Pinned") }
                )

                // Color filter dots
                NoteColor.entries.filter { it != NoteColor.WHITE }.forEach { colorOption ->
                    val isSelected = state.selectedColor == colorOption
                    Box(
                        modifier = Modifier
                            .size(26.dp)
                            .clip(CircleShape)
                            .background(colorOption.swatchColor)
                            .border(
                                width = if (isSelected) 2.5.dp else 1.dp,
                                color = if (isSelected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.outline
                                },
                                shape = CircleShape
                            )
                            .clickable { onSelectColor(colorOption) }
                    )
                }

                // Tag chips
                state.allTags.forEach { tag ->
                    val isSelected = state.selectedTag.equals(tag, ignoreCase = true)
                    FilterChip(
                        selected = isSelected,
                        onClick = { onSelectTag(tag) },
                        label = { Text("#$tag") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    )
                }
            }

            if (filteredNotes.isEmpty()) {
                EmptyNotesState(
                    hasActiveFilter = state.searchQuery.isNotBlank() ||
                        state.selectedTag != null ||
                        state.selectedColor != null ||
                        state.pinnedOnly,
                    isLoading = state.isLoadingNotes,
                    onClearFilters = onClearFilters,
                    onNewNote = onNewNote
                )
            } else {
                val columns = if (state.isGridLayout) {
                    StaggeredGridCells.Fixed(2)
                } else {
                    StaggeredGridCells.Fixed(1)
                }
                LazyVerticalStaggeredGrid(
                    columns = columns,
                    contentPadding = PaddingValues(
                        start = 14.dp,
                        end = 14.dp,
                        top = 8.dp,
                        bottom = 96.dp
                    ),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalItemSpacing = 10.dp,
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(filteredNotes, key = { it.id }) { note ->
                        NoteCardItem(
                            note = note,
                            resolveMediaUrl = resolveMediaUrl,
                            onClick = { onOpenNote(note) },
                            onTogglePin = { onToggleNotePin(note) },
                            onTagClick = { tag -> onSelectTag(tag) }
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NoteCardItem(
    note: Note,
    resolveMediaUrl: (noteId: String, mediaId: String) -> String,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onTagClick: (String) -> Unit
) {
    val isDark = isSystemInDarkTheme()
    val cardBg = note.color.backgroundColor(isDark)
    val preview = remember(note.content) { note.previewText() }
    val mediaIds = remember(note.content) { note.embeddedMediaIds() }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.5.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Header row: Title + Pin button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                if (!note.title.isNullOrBlank()) {
                    Text(
                        text = note.title,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .padding(end = 6.dp)
                    )
                } else {
                    Spacer(modifier = Modifier.weight(1f))
                }

                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(
                            if (note.pinned) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                Color.Transparent
                            }
                        )
                        .clickable { onTogglePin() },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (note.pinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                        contentDescription = if (note.pinned) "Unpin" else "Pin",
                        tint = if (note.pinned) {
                            MaterialTheme.colorScheme.onPrimary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
                        },
                        modifier = Modifier.size(15.dp)
                    )
                }
            }

            // First embedded image thumbnail if present
            if (mediaIds.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    AsyncImage(
                        model = resolveMediaUrl(note.id, mediaIds.first()),
                        contentDescription = "Note Image",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                    if (mediaIds.size > 1) {
                        Surface(
                            color = Color.Black.copy(alpha = 0.6f),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(6.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Image,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(modifier = Modifier.width(3.dp))
                                Text(
                                    text = "+${mediaIds.size - 1}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }
            }

            // Content preview
            if (preview.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = preview,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.86f),
                    maxLines = 7,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Tags row
            if (note.tags.isNotEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    note.tags.take(4).forEach { tag ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f),
                            modifier = Modifier.clickable { onTagClick(tag) }
                        ) {
                            Text(
                                text = "#$tag",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                            )
                        }
                    }
                    if (note.tags.size > 4) {
                        Text(
                            text = "+${note.tags.size - 4}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 3.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyNotesState(
    hasActiveFilter: Boolean,
    isLoading: Boolean,
    onClearFilters: () -> Unit,
    onNewNote: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        if (isLoading) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Syncing your notes...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Default.EditNote,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f),
                    modifier = Modifier.size(64.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = if (hasActiveFilter) "No matching notes found" else "No notes yet",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = if (hasActiveFilter) {
                        "Try adjusting your search query or tag filters."
                    } else {
                        "Tap 'New Note' below to capture your first thought."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))
                if (hasActiveFilter) {
                    TextButton(onClick = onClearFilters) {
                        Text("Clear Filters")
                    }
                } else {
                    TextButton(onClick = onNewNote) {
                        Text("+ Create Note")
                    }
                }
            }
        }
    }
}
