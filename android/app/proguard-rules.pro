# v0.17.0 — R8 release-minify rules. The Capacitor bridge invokes plugin
# methods REFLECTIVELY (annotation discovery) — without these keeps every
# NamaNative call becomes "not implemented" at runtime.

# Capacitor runtime + WebView bridge
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}

# Our own native surface (player activity, plugin, statics polled by JS)
-keep class ir.frame.nama.** { *; }

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Media3/ExoPlayer (ships consumer rules; these silence the rest)
-dontwarn androidx.media3.**

# OkHttp / Okio (they carry their own consumer rules; silence leftovers)
-dontwarn okhttp3.**
-dontwarn okio.**

# Keep line numbers for readable crash traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
