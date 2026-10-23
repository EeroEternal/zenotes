package site.zenotes.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import site.zenotes.android.model.CurrentUser
import site.zenotes.android.model.Note
import site.zenotes.android.model.NoteColor
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class ApiException(override val message: String, val statusCode: Int = 0) : IOException(message)

class ZeNotesApi(private val sessionStore: SessionStore) {

    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS)
        .writeTimeout(35, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val original = chain.request()
            val token = sessionStore.authToken
            val reqBuilder = original.newBuilder()
            if (!token.isNullOrBlank() && original.header("Authorization") == null) {
                reqBuilder.header("Authorization", "Bearer $token")
            }
            chain.proceed(reqBuilder.build())
        }
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private fun baseUrl(): String = sessionStore.apiBaseUrl

    fun mediaUrl(noteId: String, mediaId: String): String {
        val token = sessionStore.authToken ?: ""
        val encodedNote = URLEncoder.encode(noteId, "UTF-8")
        val encodedMedia = URLEncoder.encode(mediaId, "UTF-8")
        val encodedToken = URLEncoder.encode(token, "UTF-8")
        return "${baseUrl()}/notes/$encodedNote/media/$encodedMedia?token=$encodedToken"
    }

    suspend fun login(username: String, password: String): CurrentUser = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("username", username.trim())
            put("password", password)
        }
        val req = Request.Builder()
            .url("${baseUrl()}/auth/login")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()

        executeJson(req) { json ->
            val user = parseUser(json)
            sessionStore.saveUser(user)
            user
        }
    }

    suspend fun register(username: String, email: String, password: String): CurrentUser = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("username", username.trim())
            put("email", email.trim())
            put("password", password)
        }
        val req = Request.Builder()
            .url("${baseUrl()}/auth/register")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()

        executeJson(req) { json ->
            val user = parseUser(json)
            sessionStore.saveUser(user)
            user
        }
    }

    suspend fun fetchMe(): CurrentUser? = withContext(Dispatchers.IO) {
        if (sessionStore.authToken.isNullOrBlank()) return@withContext null
        val req = Request.Builder()
            .url("${baseUrl()}/auth/me")
            .get()
            .build()

        httpClient.newCall(req).execute().use { res ->
            if (res.code == 401) {
                sessionStore.clearSession()
                return@withContext null
            }
            val bodyStr = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                throw parseError(res.code, bodyStr)
            }
            val json = JSONObject(bodyStr)
            val user = parseUser(json)
            sessionStore.saveUser(user)
            user
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        val token = sessionStore.authToken
        sessionStore.clearSession()
        if (!token.isNullOrBlank()) {
            try {
                val req = Request.Builder()
                    .url("${baseUrl()}/auth/logout")
                    .header("Authorization", "Bearer $token")
                    .post("{}".toRequestBody(jsonMediaType))
                    .build()
                httpClient.newCall(req).execute().close()
            } catch (_: Exception) {
                // Local session already cleared
            }
        }
    }

    /**
     * 逐页拉取笔记；每拉到一页就回调一次，靠前的页先展示。
     * 后续页失败时保留已拿到的部分，只有第一页失败才抛异常。
     */
    suspend fun fetchAllNotes(onPage: ((List<Note>) -> Unit)? = null): List<Note> =
        withContext(Dispatchers.IO) {
            val allNotes = mutableListOf<Note>()
            var page = 1
            val pageSize = 100
            while (true) {
                val req = Request.Builder()
                    .url("${baseUrl()}/notes?page=$page&pageSize=$pageSize")
                    .get()
                    .build()

                val result = try {
                    executeJson(req) { json ->
                        val arr = json.optJSONArray("notes") ?: JSONArray()
                        val parsed = buildList {
                            for (i in 0 until arr.length()) {
                                val obj = arr.optJSONObject(i) ?: continue
                                add(SessionStore.parseNoteJson(obj))
                            }
                        }
                        val pagination = json.optJSONObject("pagination")
                        val totalP = pagination?.optInt("totalPages", 1) ?: 1
                        parsed to totalP
                    }
                } catch (e: Exception) {
                    // 401 仍要冒泡，让 UI 走重新登录；其余后续页错误保留已拿到的笔记
                    if (allNotes.isEmpty() || (e is ApiException && e.statusCode == 401)) throw e
                    break
                }
                val (pageNotes, totalPages) = result
                allNotes.addAll(pageNotes)
                onPage?.invoke(allNotes.toList())
                if (page >= totalPages || pageNotes.isEmpty() || page >= 20) {
                    break
                }
                page++
            }
            sessionStore.saveCachedNotes(allNotes)
            allNotes
        }

    suspend fun createNote(
        title: String?,
        content: String,
        color: NoteColor,
        tags: List<String>,
        pinned: Boolean
    ): Note = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            val cleanTitle = title?.trim()
            if (!cleanTitle.isNullOrEmpty()) {
                put("title", cleanTitle)
            } else {
                put("title", JSONObject.NULL)
            }
            put("content", content)
            put("color", color.apiValue)
            put("tags", JSONArray(tags))
            put("pinned", pinned)
        }
        val req = Request.Builder()
            .url("${baseUrl()}/notes")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()

        executeJson(req) { json ->
            SessionStore.parseNoteJson(json)
        }
    }

    suspend fun updateNote(
        id: String,
        title: String? = null,
        includeTitle: Boolean = false,
        content: String? = null,
        color: NoteColor? = null,
        tags: List<String>? = null,
        pinned: Boolean? = null
    ): Note = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            if (includeTitle) {
                val cleanTitle = title?.trim()
                if (!cleanTitle.isNullOrEmpty()) {
                    put("title", cleanTitle)
                } else {
                    put("title", JSONObject.NULL)
                }
            }
            if (content != null) put("content", content)
            if (color != null) put("color", color.apiValue)
            if (tags != null) put("tags", JSONArray(tags))
            if (pinned != null) put("pinned", pinned)
        }
        val encodedId = URLEncoder.encode(id, "UTF-8")
        val req = Request.Builder()
            .url("${baseUrl()}/notes/$encodedId")
            .patch(payload.toString().toRequestBody(jsonMediaType))
            .build()

        executeJson(req) { json ->
            SessionStore.parseNoteJson(json)
        }
    }

    suspend fun deleteNote(id: String) = withContext(Dispatchers.IO) {
        val encodedId = URLEncoder.encode(id, "UTF-8")
        val req = Request.Builder()
            .url("${baseUrl()}/notes/$encodedId")
            .delete()
            .build()

        httpClient.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                val bodyStr = res.body?.string().orEmpty()
                throw parseError(res.code, bodyStr)
            }
        }
    }

    private fun parseUser(json: JSONObject): CurrentUser {
        return CurrentUser(
            id = json.optLong("id", 0L),
            username = json.optString("username", ""),
            email = json.optString("email", ""),
            token = json.optString("token", "").takeIf { it.isNotBlank() } ?: sessionStore.authToken
        )
    }

    private fun <T> executeJson(request: Request, parser: (JSONObject) -> T): T {
        httpClient.newCall(request).execute().use { res ->
            val bodyStr = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                throw parseError(res.code, bodyStr)
            }
            val json = if (bodyStr.isBlank()) JSONObject() else JSONObject(bodyStr)
            return parser(json)
        }
    }

    private fun parseError(code: Int, bodyStr: String): ApiException {
        val message = try {
            val json = JSONObject(bodyStr)
            val msg = json.optString("message").takeIf { it.isNotBlank() }
                ?: json.optString("error").takeIf { it.isNotBlank() }
            msg ?: "Request failed (HTTP $code)"
        } catch (_: Exception) {
            if (code == 401) "Unauthorized or invalid credentials" else "Request failed (HTTP $code)"
        }
        return ApiException(message, code)
    }
}
