# Production ProGuard / R8 Keep Rules for FabricMatcher

# React Native & Hermes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
    @com.facebook.react.bridge.ReactProp <methods>;
}

# VisionCamera
-keep class com.mrousavy.camera.** { *; }

# NitroModules
-keep class com.margelo.nitro.** { *; }

# Async Storage
-keep class com.reactnativecommunity.asyncstorage.** { *; }
