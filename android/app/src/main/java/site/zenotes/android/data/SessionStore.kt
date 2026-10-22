package site.zenotes.android.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import site.zenotes.android.model.CurrentUser
import site.zenotes.android.model.Note
import site.zenotes.android.model.NoteColor

class SessionStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("zenotes_prefs", Context.MODE_PRIVATE)

    var apiBaseUrl: String
        get() = prefs.getString(KEY_API_BASE, DEFAULT_API_BASE)?.trim()?.trimEnd('/') ?: DEFAULT_API_BASE
        set(value) {
            val normalized = value.trim().trimEnd('/').ifEmpty { DEFAULT_API_BASE }
            prefs.edit().putString(KEY_API_BASE, normalized).apply()
        }

    var authToken: String?
        get() = prefs.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() }
        set(value) {
            prefs.edit().apply {
                if (value.isNullOrBlank()) remove(KEY_TOKEN) else putString(KEY_TOKEN, value)
            }.apply()
        }

    var isGridLayout: Boolean
        get() = prefs.getBoolean(KEY_GRID_LAYOUT, true)
        set(value) {
            prefs.edit().putBoolean(KEY_GRID_LAYOUT, value).apply()
        }

    fun saveUser(user: CurrentUser) {
        prefs.edit().apply {
            putLong(KEY_USER_ID, user.id)
            putString(KEY_USERNAME, user.username)
            putString(KEY_EMAIL, user.email)
            if (!user.token.isNullOrBlank()) {
                putString(KEY_TOKEN, user.token)
            }
        }.apply()
    }

    fun getSavedUser(): CurrentUser? {
        val token = authToken ?: return null
        val id = prefs.getLong(KEY_USER_ID, -1L)
        val username = prefs.getString(KEY_USERNAME, null) ?: return null
        val email = prefs.getString(KEY_EMAIL, "") ?: ""
        if (id < 0) return null
        return CurrentUser(id = id, username = username, email = email, token = token)
    }

    fun clearSession() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_USERNAME)
            .remove(KEY_EMAIL)
            .remove(KEY_CACHED_NOTES)
            .apply()
    }

    fun saveCachedNotes(notes: List<Note>) {
        val arr = JSONArray()
        for (n in notes) {
            val obj = JSONObject().apply {
                put("id", n.id)
                put("title", n.title ?: JSONObject.NULL)
                put("content", n.content)
                put("color", n.color.apiValue)
                put("tags", JSONArray(n.tags))
                put("pinned", n.pinned)
                put("position", n.position)
                put("createdAt", n.createdAt)
                put("updatedAt", n.updatedAt)
            }
            arr.put(obj)
        }
        prefs.edit().putString(KEY_CACHED_NOTES, arr.toString()).apply()
    }

    fun getCachedNotes(): List<Note> {
        val raw = prefs.getString(KEY_CACHED_NOTES, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    add(parseNoteJson(obj))
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    companion object {
        const val DEFAULT_API_BASE = "https://api.zenotes.site/api"
        private const val KEY_API_BASE = "api_base_url"
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USERNAME = "username"
        private const val KEY_EMAIL = "email"
        private const val KEY_CACHED_NOTES = "cached_notes_json"
        private const val KEY_GRID_LAYOUT = "is_grid_layout"

        fun parseNoteJson(obj: JSONObject): Note {
            val tagsArr = obj.optJSONArray("tags")
            val tags = mutableListOf<String>()
            if (tagsArr != null) {
                for (j in 0 until tagsArr.length()) {
                    val t = tagsArr.optString(j)?.trim()
                    if (!t.isNullOrEmpty()) tags.add(t)
                }
            }
            val rawTitle = if (obj.isNull("title")) null else obj.optString("title", "")
            val title = rawTitle?.trim()?.takeIf { it.isNotEmpty() }
            return Note(
                id = obj.optString("id", ""),
                title = title,
                content = obj.optString("content", ""),
                color = NoteColor.fromApi(obj.optString("color", "white")),
                tags = tags,
                pinned = obj.optBoolean("pinned", false),
                position = obj.optInt("position", 0),
                createdAt = obj.optString("createdAt", ""),
                updatedAt = obj.optString("updatedAt", "")
            )
        }
    }
}
