package ir.frame.nama;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // v0.16.3 FIX — the Bridge is created INSIDE super.onCreate(); plugins
        // registered after that never reach the WebView: every JS call rejected
        // with «NamaNative.playVideo() is not implemented on android», the
        // failure ladder burned all variants instantly and every MKV/extension-
        // less/legacy-container title hit the fatal screen. The plugin has been
        // dead like this since v0.12.0 (only WebView-safe mp4/webm/m3u8 ever
        // played). Capacitor contract: registerPlugin() MUST precede
        // super.onCreate() — see capacitorjs.com/docs/android/custom-code.
        registerPlugin(NamaNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
