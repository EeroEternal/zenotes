# ZeNotes Android

Native Kotlin + Jetpack Compose client for the ZeNotes API.

## What it does

- Sign in / register against `https://api.zenotes.site/api` (editable on the sign-in screen)
- Notes list with search, tag / color / pinned filters, masonry or list layout
- Create, edit, pin, recolor, tag and delete notes; inline images from `zenotes:media:` refs
- Share plain text from other apps straight into a new note
- Notes cached locally, so the list opens offline

## Build

Needs JDK 17 and Android SDK 34 (`ANDROID_HOME` or `local.properties` `sdk.dir`).

```bash
export ANDROID_HOME=$HOME/.local/share/android-sdk
./gradlew testDebugUnitTest assembleDebug assembleRelease
# or, if the wrapper distribution cannot be downloaded:
gradle testDebugUnitTest assembleDebug assembleRelease
```

Outputs:

- `app/build/outputs/apk/debug/app-debug.apk`
- `app/build/outputs/apk/release/app-release.apk` (signed with the debug key, so it installs directly)

## Install

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

Or copy the APK to the phone and open it (allow "install unknown apps" for the file manager).
