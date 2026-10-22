package site.zenotes.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import site.zenotes.android.ui.MainViewModel
import site.zenotes.android.ui.screens.AuthScreen
import site.zenotes.android.ui.screens.NoteEditorScreen
import site.zenotes.android.ui.screens.NotesListScreen
import site.zenotes.android.ui.theme.ZeNotesTheme

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIncomingSendIntent(intent)

        setContent {
            ZeNotesTheme {
                val state by viewModel.uiState.collectAsState()
                val snackbarHostState = remember { SnackbarHostState() }

                LaunchedEffect(state.message) {
                    val msg = state.message
                    if (!msg.isNullOrBlank() && state.user != null) {
                        snackbarHostState.showSnackbar(msg)
                        viewModel.showMessage(null)
                    }
                }

                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    when {
                        state.isBootstrapping -> {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }

                        state.user == null -> {
                            AuthScreen(
                                apiBaseUrl = state.apiBaseUrl,
                                isSubmitting = state.isSubmittingAuth,
                                errorMessage = state.message,
                                onUpdateApiBaseUrl = viewModel::updateApiBaseUrl,
                                onLogin = viewModel::login,
                                onRegister = viewModel::register
                            )
                        }

                        else -> {
                            Crossfade(
                                targetState = state.activeEditorNote,
                                label = "MainOrEditor"
                            ) { draft ->
                                if (draft != null) {
                                    NoteEditorScreen(
                                        initialDraft = draft,
                                        isSaving = state.isSavingNote,
                                        resolveMediaUrl = viewModel.api::mediaUrl,
                                        onSave = viewModel::saveEditorDraft,
                                        onDelete = viewModel::deleteNote,
                                        onCancel = viewModel::closeEditor
                                    )
                                } else {
                                    NotesListScreen(
                                        state = state,
                                        snackbarHostState = snackbarHostState,
                                        resolveMediaUrl = viewModel.api::mediaUrl,
                                        onSearchQueryChange = viewModel::setSearchQuery,
                                        onSelectTag = viewModel::selectTag,
                                        onSelectColor = viewModel::selectColorFilter,
                                        onTogglePinnedOnly = viewModel::togglePinnedOnly,
                                        onClearFilters = viewModel::clearFilters,
                                        onToggleLayout = viewModel::toggleLayoutMode,
                                        onRefresh = { viewModel.refreshNotes(silent = false) },
                                        onNewNote = { viewModel.openNewNote() },
                                        onOpenNote = viewModel::openNoteForEdit,
                                        onToggleNotePin = viewModel::toggleNotePin,
                                        onLogout = viewModel::logout
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncomingSendIntent(intent)
    }

    private fun handleIncomingSendIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (!sharedText.isNullOrBlank()) {
                viewModel.openNewNote(sharedText)
                intent.action = Intent.ACTION_MAIN
            }
        }
    }
}
