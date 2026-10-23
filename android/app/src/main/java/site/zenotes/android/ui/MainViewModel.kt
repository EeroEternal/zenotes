package site.zenotes.android.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import site.zenotes.android.data.ApiException
import site.zenotes.android.data.SessionStore
import site.zenotes.android.data.ZeNotesApi
import site.zenotes.android.model.CurrentUser
import site.zenotes.android.model.Note
import site.zenotes.android.model.NoteColor

data class UiState(
    val isBootstrapping: Boolean = true,
    val user: CurrentUser? = null,
    val apiBaseUrl: String = SessionStore.DEFAULT_API_BASE,
    val notes: List<Note> = emptyList(),
    val isLoadingNotes: Boolean = false,
    val isSubmittingAuth: Boolean = false,
    val isSavingNote: Boolean = false,
    val searchQuery: String = "",
    val selectedTag: String? = null,
    val selectedColor: NoteColor? = null,
    val pinnedOnly: Boolean = false,
    val isGridLayout: Boolean = true,
    val activeEditorNote: EditorDraft? = null,
    val message: String? = null
) {
    val allTags: List<String>
        get() = notes
            .flatMap { it.tags }
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .groupingBy { it }
            .eachCount()
            .entries
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
            .map { it.key }

    val filteredNotes: List<Note>
        get() {
            val q = searchQuery.trim().lowercase()
            return notes
                .filter { note ->
                    if (pinnedOnly && !note.pinned) return@filter false
                    if (selectedTag != null && note.tags.none { it.equals(selectedTag, ignoreCase = true) }) {
                        return@filter false
                    }
                    if (selectedColor != null && note.color != selectedColor) {
                        return@filter false
                    }
                    if (q.isNotEmpty()) {
                        val inTitle = note.title?.lowercase()?.contains(q) == true
                        val inBody = note.content.lowercase().contains(q)
                        val inTags = note.tags.any { it.lowercase().contains(q) }
                        if (!inTitle && !inBody && !inTags) return@filter false
                    }
                    true
                }
                .sortedWith(
                    compareByDescending<Note> { it.pinned }
                        .thenBy { it.position }
                        .thenByDescending { it.updatedAt }
                )
        }
}

data class EditorDraft(
    val id: String? = null, // null means creating a new note
    val title: String = "",
    val content: String = "",
    val color: NoteColor = NoteColor.WHITE,
    val tags: List<String> = emptyList(),
    val pinned: Boolean = false,
    val updatedAt: String = ""
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    val sessionStore = SessionStore(application)
    val api = ZeNotesApi(sessionStore)

    private val _uiState = MutableStateFlow(
        UiState(
            apiBaseUrl = sessionStore.apiBaseUrl,
            isGridLayout = sessionStore.isGridLayout,
            user = sessionStore.getSavedUser(),
            notes = sessionStore.getCachedNotes()
        )
    )
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        bootstrapSession()
    }

    private fun bootstrapSession() {
        val savedUser = sessionStore.getSavedUser()
        if (savedUser == null) {
            _uiState.update { it.copy(isBootstrapping = false, user = null) }
            return
        }
        // Immediately show cached user + cached notes while verifying & refreshing in background
        _uiState.update { it.copy(isBootstrapping = false, user = savedUser) }
        viewModelScope.launch {
            try {
                val me = api.fetchMe()
                if (me == null) {
                    _uiState.update {
                        it.copy(
                            user = null,
                            notes = emptyList(),
                            message = "Session expired, please sign in again."
                        )
                    }
                    return@launch
                }
                _uiState.update { it.copy(user = me) }
                refreshNotes(silent = true)
            } catch (_: Exception) {
                // Keep cached notes offline if network fails during startup
                refreshNotes(silent = true)
            }
        }
    }

    fun updateApiBaseUrl(url: String) {
        sessionStore.apiBaseUrl = url
        _uiState.update { it.copy(apiBaseUrl = sessionStore.apiBaseUrl) }
    }

    fun login(username: String, password: String) {
        if (username.isBlank() || password.isEmpty()) {
            showMessage("Please enter your username and password.")
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingAuth = true, message = null) }
            try {
                val user = api.login(username, password)
                _uiState.update {
                    it.copy(
                        user = user,
                        isSubmittingAuth = false,
                        notes = sessionStore.getCachedNotes()
                    )
                }
                refreshNotes(silent = false)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSubmittingAuth = false,
                        message = e.message ?: "Sign in failed"
                    )
                }
            }
        }
    }

    fun register(username: String, email: String, password: String) {
        if (username.trim().length < 3) {
            showMessage("Username must be at least 3 characters.")
            return
        }
        if (!email.contains("@")) {
            showMessage("Please enter a valid email address.")
            return
        }
        if (password.length < 6) {
            showMessage("Password must be at least 6 characters.")
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingAuth = true, message = null) }
            try {
                val user = api.register(username, email, password)
                _uiState.update {
                    it.copy(
                        user = user,
                        isSubmittingAuth = false,
                        notes = emptyList()
                    )
                }
                refreshNotes(silent = false)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSubmittingAuth = false,
                        message = e.message ?: "Registration failed"
                    )
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            api.logout()
            _uiState.update {
                it.copy(
                    user = null,
                    notes = emptyList(),
                    activeEditorNote = null,
                    selectedTag = null,
                    selectedColor = null,
                    pinnedOnly = false,
                    searchQuery = ""
                )
            }
        }
    }

    fun refreshNotes(silent: Boolean = false) {
        if (_uiState.value.user == null) return
        viewModelScope.launch {
            if (!silent) {
                _uiState.update { it.copy(isLoadingNotes = true) }
            }
            try {
                // 第一页先显示，剩余页在后台继续追加；后页失败不再打断已同步内容
                val notes = api.fetchAllNotes { partial ->
                    _uiState.update {
                        it.copy(
                            notes = partial,
                            isLoadingNotes = false
                        )
                    }
                }
                _uiState.update {
                    it.copy(
                        notes = notes,
                        isLoadingNotes = false
                    )
                }
            } catch (e: ApiException) {
                if (e.statusCode == 401) {
                    sessionStore.clearSession()
                    _uiState.update {
                        it.copy(
                            user = null,
                            notes = emptyList(),
                            isLoadingNotes = false,
                            message = "Session expired, please sign in again."
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isLoadingNotes = false,
                            message = if (silent) null else (e.message ?: "Failed to sync notes")
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingNotes = false,
                        message = if (silent) null else "Network error: showing cached notes"
                    )
                }
            }
        }
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun selectTag(tag: String?) {
        _uiState.update { state ->
            val next = if (state.selectedTag.equals(tag, ignoreCase = true)) null else tag
            state.copy(selectedTag = next)
        }
    }

    fun selectColorFilter(color: NoteColor?) {
        _uiState.update { state ->
            val next = if (state.selectedColor == color) null else color
            state.copy(selectedColor = next)
        }
    }

    fun togglePinnedOnly() {
        _uiState.update { it.copy(pinnedOnly = !it.pinnedOnly) }
    }

    fun clearFilters() {
        _uiState.update {
            it.copy(
                searchQuery = "",
                selectedTag = null,
                selectedColor = null,
                pinnedOnly = false
            )
        }
    }

    fun toggleLayoutMode() {
        val next = !_uiState.value.isGridLayout
        sessionStore.isGridLayout = next
        _uiState.update { it.copy(isGridLayout = next) }
    }

    fun openNewNote(initialText: String = "") {
        val defaultTags = _uiState.value.selectedTag?.let { listOf(it) } ?: emptyList()
        val defaultColor = _uiState.value.selectedColor ?: NoteColor.WHITE
        _uiState.update {
            it.copy(
                activeEditorNote = EditorDraft(
                    id = null,
                    title = "",
                    content = initialText,
                    color = defaultColor,
                    tags = defaultTags,
                    pinned = false
                )
            )
        }
    }

    fun openNoteForEdit(note: Note) {
        _uiState.update {
            it.copy(
                activeEditorNote = EditorDraft(
                    id = note.id,
                    title = note.title.orEmpty(),
                    content = note.content,
                    color = note.color,
                    tags = note.tags,
                    pinned = note.pinned,
                    updatedAt = note.updatedAt
                )
            )
        }
    }

    fun closeEditor() {
        _uiState.update { it.copy(activeEditorNote = null) }
    }

    fun saveEditorDraft(draft: EditorDraft) {
        val trimmedTitle = draft.title.trim()
        val trimmedContent = draft.content.trim()
        if (draft.id == null && trimmedTitle.isEmpty() && trimmedContent.isEmpty()) {
            closeEditor()
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSavingNote = true) }
            try {
                if (draft.id == null) {
                    val created = api.createNote(
                        title = trimmedTitle.ifEmpty { null },
                        content = draft.content,
                        color = draft.color,
                        tags = draft.tags,
                        pinned = draft.pinned
                    )
                    val updatedList = listOf(created) + _uiState.value.notes
                    sessionStore.saveCachedNotes(updatedList)
                    _uiState.update {
                        it.copy(
                            notes = updatedList,
                            isSavingNote = false,
                            activeEditorNote = null,
                            message = "Note created"
                        )
                    }
                } else {
                    val updated = api.updateNote(
                        id = draft.id,
                        title = trimmedTitle.ifEmpty { null },
                        includeTitle = true,
                        content = draft.content,
                        color = draft.color,
                        tags = draft.tags,
                        pinned = draft.pinned
                    )
                    val updatedList = _uiState.value.notes.map {
                        if (it.id == updated.id) updated else it
                    }
                    sessionStore.saveCachedNotes(updatedList)
                    _uiState.update {
                        it.copy(
                            notes = updatedList,
                            isSavingNote = false,
                            activeEditorNote = null,
                            message = "Note saved"
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSavingNote = false,
                        message = e.message ?: "Failed to save note"
                    )
                }
            }
        }
    }

    fun toggleNotePin(note: Note) {
        val targetPinned = !note.pinned
        val optimisticList = _uiState.value.notes.map {
            if (it.id == note.id) it.copy(pinned = targetPinned) else it
        }
        _uiState.update { it.copy(notes = optimisticList) }

        viewModelScope.launch {
            try {
                val updated = api.updateNote(id = note.id, pinned = targetPinned)
                val finalList = _uiState.value.notes.map {
                    if (it.id == updated.id) updated else it
                }
                sessionStore.saveCachedNotes(finalList)
                _uiState.update { it.copy(notes = finalList) }
            } catch (e: Exception) {
                // Revert on failure
                val reverted = _uiState.value.notes.map {
                    if (it.id == note.id) note else it
                }
                _uiState.update {
                    it.copy(
                        notes = reverted,
                        message = e.message ?: "Failed to update pin status"
                    )
                }
            }
        }
    }

    fun deleteNote(noteId: String) {
        val previous = _uiState.value.notes
        val filtered = previous.filterNot { it.id == noteId }
        sessionStore.saveCachedNotes(filtered)
        _uiState.update {
            it.copy(
                notes = filtered,
                activeEditorNote = null,
                message = "Note deleted"
            )
        }
        viewModelScope.launch {
            try {
                api.deleteNote(noteId)
            } catch (e: Exception) {
                sessionStore.saveCachedNotes(previous)
                _uiState.update {
                    it.copy(
                        notes = previous,
                        message = e.message ?: "Failed to delete note"
                    )
                }
            }
        }
    }

    fun showMessage(msg: String?) {
        _uiState.update { it.copy(message = msg) }
    }
}
