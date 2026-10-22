package site.zenotes.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ZeOrangePrimary = Color(0xFFEC7D1C)
val ZeOrangeDark = Color(0xFFF28B30)
val ZeWarmBgLight = Color(0xFFFAF8F3)
val ZeWarmSurfaceLight = Color(0xFFFFFFFF)
val ZeWarmSecondaryLight = Color(0xFFF2ECE1)

val ZeWarmBgDark = Color(0xFF171310)
val ZeWarmSurfaceDark = Color(0xFF231D19)
val ZeWarmSecondaryDark = Color(0xFF2E2722)

private val LightColors = lightColorScheme(
    primary = ZeOrangePrimary,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFDE6D0),
    onPrimaryContainer = Color(0xFF3E1C00),
    secondary = Color(0xFF6B5B4D),
    onSecondary = Color.White,
    secondaryContainer = ZeWarmSecondaryLight,
    onSecondaryContainer = Color(0xFF261E17),
    background = ZeWarmBgLight,
    onBackground = Color(0xFF241E18),
    surface = ZeWarmSurfaceLight,
    onSurface = Color(0xFF241E18),
    surfaceVariant = ZeWarmSecondaryLight,
    onSurfaceVariant = Color(0xFF6E6258),
    outline = Color(0xFFE4DDD1),
    error = Color(0xFFDC3A3A),
    onError = Color.White
)

private val DarkColors = darkColorScheme(
    primary = ZeOrangeDark,
    onPrimary = Color(0xFF1E1308),
    primaryContainer = Color(0xFF5A2E06),
    onPrimaryContainer = Color(0xFFFFDCC0),
    secondary = Color(0xFFD5C3B3),
    onSecondary = Color(0xFF392E24),
    secondaryContainer = ZeWarmSecondaryDark,
    onSecondaryContainer = Color(0xFFF2DFCF),
    background = ZeWarmBgDark,
    onBackground = Color(0xFFF4EFE9),
    surface = ZeWarmSurfaceDark,
    onSurface = Color(0xFFF4EFE9),
    surfaceVariant = ZeWarmSecondaryDark,
    onSurfaceVariant = Color(0xFFA8998B),
    outline = Color(0xFF3C332C),
    error = Color(0xFFE55353),
    onError = Color.White
)

@Composable
fun ZeNotesTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
